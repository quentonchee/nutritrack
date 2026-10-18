// Estimation des calories d'un plat à partir d'une photo.
// Deux fournisseurs possibles :
//  - Google Gemini (gratuit avec une clé Google AI Studio, dans la limite du quota gratuit)
//  - Claude d'Anthropic (payant à l'usage, optionnel)
// La clé API reste uniquement sur ton téléphone (stockage local du navigateur).

const PROMPT = `Tu es un nutritionniste expert. Analyse la photo de ce repas.
Identifie chaque aliment visible, estime sa quantité en grammes (en t'aidant de la taille de l'assiette,
des couverts et des proportions), puis estime ses calories et macronutriments.
Tiens compte des matières grasses de cuisson et des sauces probables.
Réponds UNIQUEMENT avec un objet JSON de cette forme :
{"dish": "nom court du plat en français",
 "items": [{"name": "aliment en français", "grams": 0, "kcal": 0, "protein": 0, "carbs": 0, "fat": 0}],
 "confidence": "faible" | "moyenne" | "élevée",
 "notes": "remarque courte (hypothèses faites, ce qui pourrait changer l'estimation)"}
Les valeurs protein / carbs / fat sont en grammes. Si la photo ne montre pas de nourriture,
renvoie items vide et explique-le dans notes.`;

const SCHEMA = {
  type: 'object',
  properties: {
    dish: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          grams: { type: 'number' },
          kcal: { type: 'number' },
          protein: { type: 'number' },
          carbs: { type: 'number' },
          fat: { type: 'number' },
        },
        required: ['name', 'grams', 'kcal', 'protein', 'carbs', 'fat'],
        additionalProperties: false,
      },
    },
    confidence: { type: 'string', enum: ['faible', 'moyenne', 'élevée'] },
    notes: { type: 'string' },
  },
  required: ['dish', 'items', 'confidence', 'notes'],
  additionalProperties: false,
};

export const PROVIDERS = {
  gemini: {
    label: 'Google Gemini (gratuit)',
    defaultModel: 'gemini-flash-latest',
    keyHelp: 'Clé gratuite sur aistudio.google.com → « Get API key ».',
  },
  claude: {
    label: 'Claude – Anthropic (payant)',
    defaultModel: 'claude-haiku-5-5',
    keyHelp: 'Clé sur console.anthropic.com (nécessite du crédit prépayé).',
  },
};

export const CLAUDE_MODELS = [
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (le moins cher)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (le plus précis)' },
];

// Réduit la photo (max 1024 px) pour accélérer l'envoi et rester dans les limites.
export async function resizeImage(file, maxSide = 1024, quality = 0.85) {
  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  return { dataUrl, base64: dataUrl.split(',')[1] };
}

function loadBitmap(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Impossible de lire cette image.'));
    img.src = URL.createObjectURL(file);
  });
}

export async function analyzeMeal({ provider, apiKey, model, base64, hint }) {
  if (!apiKey) throw new Error('Ajoute ta clé API dans Profil → Analyse photo.');
  const text = hint ? `${PROMPT}\n\nPrécision donnée par l'utilisateur : ${hint}` : PROMPT;
  const result = provider === 'claude'
    ? await callClaude({ apiKey, model, base64, text })
    : await callGemini({ apiKey, model, base64, text });
  return normalize(result);
}

async function callGemini({ apiKey, model, base64, text }) {
  const m = model || PROVIDERS.gemini.defaultModel;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ inline_data: { mime_type: 'image/jpeg', data: base64 } }, { text }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `Erreur ${res.status}`;
    if (res.status === 429) throw new Error('Quota gratuit Gemini atteint pour le moment. Réessaie dans quelques minutes.');
    throw new Error(`Gemini : ${msg}`);
  }
  const out = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  if (!out) throw new Error('Gemini n\'a pas renvoyé de réponse (photo refusée ?).');
  return parseJson(out);
}

async function callClaude({ apiKey, model, base64, text }) {
  const m = model || PROVIDERS.claude.defaultModel;
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  };
  const body = {
    model: m,
    max_tokens: 4000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
        { type: 'text', text },
      ],
    }],
  };
  // Repli automatique sur un autre modèle si la requête est refusée (non dispo sur Haiku).
  if (m !== 'claude-haiku-5-5') {
    headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
    body.fallbacks = 'default';
  }
  const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `Erreur ${res.status}`;
    if (res.status === 401) throw new Error('Clé Claude invalide.');
    if (res.status === 429) throw new Error('Trop de requêtes Claude, réessaie dans un instant.');
    throw new Error(`Claude : ${msg}`);
  }
  if (data.stop_reason === 'refusal') throw new Error('Claude a refusé d\'analyser cette image.');
  if (data.stop_reason === 'max_tokens') throw new Error('Réponse incomplète, réessaie.');
  const out = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  return parseJson(out);
}

function parseJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    const match = s.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Réponse illisible de l\'IA, réessaie.');
  }
}

function normalize(r) {
  const num = (v) => Math.max(0, Math.round(Number(v) || 0));
  return {
    dish: String(r.dish || 'Repas'),
    confidence: r.confidence || 'moyenne',
    notes: String(r.notes || ''),
    items: (Array.isArray(r.items) ? r.items : []).map((i) => ({
      name: String(i.name || 'Aliment'),
      grams: num(i.grams),
      kcal: num(i.kcal),
      protein: num(i.protein),
      carbs: num(i.carbs),
      fat: num(i.fat),
    })),
  };
}
