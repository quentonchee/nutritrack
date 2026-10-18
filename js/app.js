import { ACTIVITY_LEVELS, GOALS, INTENSITIES, computePlan, isProfileComplete, macrosFor, navyBodyFat } from './calc.js';
import { FOODS } from './foods.js';
import { PROVIDERS, CLAUDE_MODELS, analyzeMeal, resizeImage } from './ai.js';
import { DEFAULT_REMINDERS, buildIcs, dueReminders, notificationsSupported, notify, requestPermission } from './reminders.js';

/* =========================================================
   Stockage local (tout reste sur ton téléphone)
   ========================================================= */
const STORE_KEY = 'nutritrack.v1';
const MEALS = [
  { id: 'breakfast', label: 'Petit-déjeuner', emoji: '🥣' },
  { id: 'lunch', label: 'Déjeuner', emoji: '🍽️' },
  { id: 'snack', label: 'Collation', emoji: '🍎' },
  { id: 'dinner', label: 'Dîner', emoji: '🌙' },
];

const DEFAULT_STATE = {
  profile: { sex: 'male', age: null, heightCm: null, weightKg: null, bodyFat: null, activity: 'moderate', goal: 'maintain', intensity: 'moderate' },
  settings: {
    provider: 'gemini',
    keys: { gemini: '', claude: '' },
    models: { gemini: PROVIDERS.gemini.defaultModel, claude: PROVIDERS.claude.defaultModel },
    reminders: DEFAULT_REMINDERS,
    useActive: true,
  },
  days: {},
  sent: { date: null, keys: [] },
  recents: [],
  ui: { installTipHidden: false },
};

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const s = JSON.parse(raw);
    return {
      ...structuredClone(DEFAULT_STATE),
      ...s,
      profile: { ...DEFAULT_STATE.profile, ...s.profile },
      settings: {
        ...DEFAULT_STATE.settings,
        ...s.settings,
        keys: { ...DEFAULT_STATE.settings.keys, ...s.settings?.keys },
        models: { ...DEFAULT_STATE.settings.models, ...s.settings?.models },
        reminders: {
          ...DEFAULT_REMINDERS,
          ...s.settings?.reminders,
          water: { ...DEFAULT_REMINDERS.water, ...s.settings?.reminders?.water },
          meals: Object.fromEntries(Object.entries(DEFAULT_REMINDERS.meals).map(([k, v]) => [k, { ...v, ...s.settings?.reminders?.meals?.[k] }])),
        },
      },
      ui: { ...DEFAULT_STATE.ui, ...s.ui },
    };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    toast('Stockage plein : exporte tes données puis supprime d\'anciennes photos.');
  }
}

/* =========================================================
   Utilitaires
   ========================================================= */
const $ = (sel, root = document) => root.querySelector(sel);
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseIso = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const todayIso = () => iso(new Date());
const addDays = (s, n) => { const d = parseIso(s); d.setDate(d.getDate() + n); return iso(d); };
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const round = (n) => Math.round(Number(n) || 0);
const fmt = (n) => round(n).toLocaleString('fr-FR');
const fmt1 = (n) => (Math.round(n * 10) / 10).toLocaleString('fr-FR');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => { const n = parseFloat(String(v).replace(/[\s\u00a0\u202f]/g, '').replace(',', '.')); return Number.isFinite(n) ? n : null; };

const ICON = {
  left: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  camera: '<svg viewBox="0 0 24 24"><path d="M4 8.5A2.5 2.5 0 016.5 6h1.3l1.4-2h5.6l1.4 2h1.3A2.5 2.5 0 0120 8.5v8a2.5 2.5 0 01-2.5 2.5h-11A2.5 2.5 0 014 16.5z"/><circle cx="12" cy="12.5" r="3.5"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3"/></svg>',
};

function dayData(date, create = false) {
  if (!state.days[date] && create) state.days[date] = { entries: [], water: 0 };
  return state.days[date] || { entries: [], water: 0 };
}

function totals(day) {
  return day.entries.reduce(
    (t, e) => ({ kcal: t.kcal + e.kcal, protein: t.protein + e.protein, carbs: t.carbs + e.carbs, fat: t.fat + e.fat }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

function currentPlan() {
  return isProfileComplete(state.profile) ? computePlan(state.profile) : null;
}

const planTarget = (plan) => ({ kcal: plan.target.kcal, ...plan.target.macros, bmr: plan.bmr, adj: plan.target.adj, goal: plan.target.id });

// Objectif du jour : figé au moment où on a commencé à remplir la journée (pour garder un historique juste).
function baseTargetFor(date) {
  const d = state.days[date];
  if (d?.target) return d.target;
  const plan = currentPlan();
  return plan ? planTarget(plan) : null;
}

// Si on a la dépense active du jour (app Santé), l'objectif devient « dynamique » :
// métabolisme de base + 10 % (digestion) + calories actives réellement dépensées, puis ajustement sèche / masse.
function targetFor(date) {
  const t = baseTargetFor(date);
  if (!t) return null;
  const active = state.days[date]?.active;
  if (!state.settings.useActive || active == null || !t.bmr) return t;
  const maintenance = t.bmr * 1.1 + active;
  const kcal = Math.round((maintenance * (1 + (t.adj || 0))) / 10) * 10;
  return { ...t, kcal, ...macrosFor(kcal, state.profile, t.goal || 'maintain'), dynamic: true, active, maintenance: Math.round(maintenance) };
}

function snapshotTarget(date) {
  const d = dayData(date, true);
  const plan = currentPlan();
  if (plan && (date === todayIso() || !d.target)) d.target = planTarget(plan);
}

function latestWeight() {
  const dates = Object.keys(state.days).filter((k) => state.days[k].weight).sort();
  return dates.length ? { date: dates.at(-1), weight: state.days[dates.at(-1)].weight } : null;
}

function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), ms);
}

const ui = { tab: 'today', date: todayIso(), calMonth: todayIso().slice(0, 7), addTab: 'photo', addMeal: null };

/* =========================================================
   Navigation
   ========================================================= */
function showTab(tab) {
  ui.tab = tab;
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.view').forEach((v) => (v.hidden = v.dataset.view !== tab));
  render();
  window.scrollTo({ top: 0 });
}

function render() {
  if (ui.tab === 'today') renderToday();
  if (ui.tab === 'calendar') renderCalendar();
  if (ui.tab === 'weight') renderWeight();
  if (ui.tab === 'profile') renderProfile();
}

/* =========================================================
   Vue : Aujourd'hui
   ========================================================= */
function dateLabel(date) {
  const t = todayIso();
  if (date === t) return 'Aujourd\'hui';
  if (date === addDays(t, -1)) return 'Hier';
  if (date === addDays(t, 1)) return 'Demain';
  return parseIso(date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

function renderToday() {
  const el = $('#view-today');
  const day = dayData(ui.date);
  const tot = totals(day);
  const target = targetFor(ui.date);
  const plan = currentPlan();

  const ringR = 62;
  const circ = 2 * Math.PI * ringR;
  const pct = target ? Math.min(tot.kcal / target.kcal, 1) : 0;
  const over = target && tot.kcal > target.kcal;
  const remaining = target ? target.kcal - tot.kcal : 0;

  const macro = (cls, name, val, goal) => `
    <div class="macro">
      <div class="name">${name}</div>
      <div class="val">${fmt(val)}${goal ? ` / ${fmt(goal)}` : ''} g</div>
      <div class="bar ${cls}"><span style="width:${goal ? Math.min((val / goal) * 100, 100) : 0}%"></span></div>
    </div>`;

  const waterGoal = plan ? Math.ceil(plan.waterL / 0.25) : 8;

  el.innerHTML = `
    <div class="page-head">
      <h1>${esc(dateLabel(ui.date))}</h1>
      <div class="date-nav">
        <button class="icon-btn" data-action="day-prev" aria-label="Jour précédent">${ICON.left}</button>
        ${ui.date !== todayIso() ? '<button class="btn small" data-action="day-today" style="padding:8px 10px">Auj.</button>' : ''}
        <button class="icon-btn" data-action="day-next" aria-label="Jour suivant">${ICON.right}</button>
      </div>
    </div>

    ${installTip()}

    ${!plan ? `
      <div class="card">
        <h2>👋 Bienvenue !</h2>
        <p class="muted small" style="margin:0 0 12px">Renseigne ton profil (âge, taille, poids, activité…) pour calculer ton quota de calories journalier.</p>
        <button class="btn primary block" data-action="goto-profile">Calculer mon quota</button>
      </div>` : ''}

    <div class="card">
      <div class="summary">
        <div class="ring ${over ? 'over' : ''}">
          <svg viewBox="0 0 148 148">
            <circle class="track" cx="74" cy="74" r="${ringR}"/>
            <circle class="value" cx="74" cy="74" r="${ringR}" stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - pct)}"/>
          </svg>
          <div class="center">
            <div class="big tnum">${target ? fmt(Math.abs(remaining)) : fmt(tot.kcal)}</div>
            <div class="cap">${target ? (over ? 'kcal en trop' : 'kcal restantes') : 'kcal'}</div>
          </div>
        </div>
        <div class="summary-stats">
          <div class="stat"><span class="muted">Objectif</span><b>${target ? fmt(target.kcal) : '—'}</b></div>
          <div class="stat"><span class="muted">Mangé</span><b>${fmt(tot.kcal)}</b></div>
          ${plan ? `<div class="stat"><span class="muted">Mode</span><b>${GOALS[target?.goal || plan.target.id].emoji} ${GOALS[target?.goal || plan.target.id].label}</b></div>` : ''}
          ${target?.dynamic ? `<div class="stat"><span class="muted">Activité</span><b>+${fmt(target.active)}</b></div>` : ''}
        </div>
      </div>
      <div class="macros">
        ${macro('p', 'Protéines', tot.protein, target?.protein)}
        ${macro('c', 'Glucides', tot.carbs, target?.carbs)}
        ${macro('f', 'Lipides', tot.fat, target?.fat)}
      </div>
    </div>

    ${plan ? activityCard(day, target) : ''}

    ${MEALS.map((m) => {
      const list = day.entries.filter((e) => e.meal === m.id);
      const kcal = list.reduce((s, e) => s + e.kcal, 0);
      return `
      <div class="card">
        <div class="meal-head">
          <h3>${m.emoji} ${m.label}</h3>
          <span class="kcal">${fmt(kcal)} kcal</span>
        </div>
        ${list.length ? `<ul class="entries">${list.map(entryRow).join('')}</ul>` : ''}
        <button class="add-btn" data-action="add" data-meal="${m.id}">+ Ajouter</button>
      </div>`;
    }).join('')}

    <div class="card">
      <div class="meal-head" style="margin-bottom:10px">
        <h3>💧 Eau</h3>
        <span class="kcal">${fmt1((day.water || 0) * 0.25)} / ${fmt1(waterGoal * 0.25)} L</span>
      </div>
      <div class="water">
        <div class="drops">
          ${Array.from({ length: waterGoal }, (_, i) => `<button class="drop ${i < (day.water || 0) ? 'on' : ''}" data-action="water" data-n="${i + 1}" aria-label="${i + 1} verre(s)" style="border:0;padding:0"></button>`).join('')}
        </div>
      </div>
    </div>

    <button class="fab" data-action="add" aria-label="Ajouter un aliment">${ICON.plus}</button>
  `;
}

function activityCard(day, target) {
  const has = day.active != null;
  const on = state.settings.useActive;
  return `
    <div class="card">
      <div class="meal-head">
        <h3>🔥 Calories dépensées</h3>
        <button class="btn small" data-action="open-activity" style="padding:6px 12px">${has ? 'Modifier' : 'Ajouter'}</button>
      </div>
      ${has ? `
        <div class="kv" style="margin-top:10px">
          <span>Activité (app Santé)</span><b>${fmt(day.active)} kcal</b>
          ${target?.dynamic ? `<span>Dépense totale estimée</span><b>${fmt(target.maintenance)} kcal</b>` : ''}
        </div>
        ${target?.dynamic ? '<p class="small muted" style="margin:8px 0 0">Ton objectif du jour s\'adapte à ton activité réelle.</p>' : ''}
        ${!on ? '<p class="small muted" style="margin:8px 0 0">L\'ajustement automatique est désactivé (Profil).</p>' : ''}`
      : `<p class="small muted" style="margin:8px 0 0">Importe tes calories actives depuis l'app Santé pour adapter ton objectif à ce que tu as vraiment bougé.</p>`}
    </div>`;
}

function entryRow(e) {
  return `
    <li class="entry" data-action="edit" data-id="${e.id}">
      ${e.thumb ? `<img class="thumb" src="${e.thumb}" alt="">` : ''}
      <div class="meta">
        <div class="name">${esc(e.name)}</div>
        <div class="sub">${e.grams ? `${fmt(e.grams)} g · ` : ''}P ${fmt(e.protein)} · G ${fmt(e.carbs)} · L ${fmt(e.fat)}</div>
      </div>
      <div class="k">${fmt(e.kcal)}</div>
    </li>`;
}

function installTip() {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone || state.ui.installTipHidden) return '';
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (!ios && !deferredInstall) return '';
  return `
    <div class="card install-tip">
      <div style="font-size:24px">📲</div>
      <div class="grow small">
        <b>Installe l'app sur ton téléphone</b><br>
        ${ios
          ? '<span class="muted">Dans Safari : touche <b>Partager</b> ⬆️ puis <b>« Sur l\'écran d\'accueil »</b>.</span>'
          : '<button class="btn primary" data-action="install" style="margin-top:8px;padding:8px 14px">Installer</button>'}
      </div>
      <button class="x" data-action="hide-install" aria-label="Masquer">✕</button>
    </div>`;
}

/* =========================================================
   Feuille : ajout d'aliment (Photo IA / Base / Manuel)
   ========================================================= */
function openSheet(html) {
  $('#sheet-body').innerHTML = html;
  $('#sheet').hidden = false;
  $('#sheet-backdrop').hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeSheet() {
  $('#sheet').hidden = true;
  $('#sheet-backdrop').hidden = true;
  document.body.style.overflow = '';
  photoState = null;
}

function defaultMeal() {
  const h = new Date().getHours();
  return h < 11 ? 'breakfast' : h < 15 ? 'lunch' : h < 18 ? 'snack' : 'dinner';
}

function openAdd(meal) {
  ui.addMeal = meal || defaultMeal();
  renderAddSheet();
}

function mealSelect(selected, attr = 'data-add-meal') {
  return `<select class="input" ${attr}>${MEALS.map((m) => `<option value="${m.id}" ${m.id === selected ? 'selected' : ''}>${m.emoji} ${m.label}</option>`).join('')}</select>`;
}

function renderAddSheet() {
  const tabs = [['photo', '📷 Photo IA'], ['foods', '🔎 Aliments'], ['manual', '✍️ Manuel']];
  openSheet(`
    <h2>Ajouter · ${esc(dateLabel(ui.date))}</h2>
    <div class="field">${mealSelect(ui.addMeal)}</div>
    <div class="seg" style="margin-bottom:14px">
      ${tabs.map(([id, l]) => `<button class="${ui.addTab === id ? 'on' : ''}" data-action="add-tab" data-tab="${id}">${l}</button>`).join('')}
    </div>
    <div id="add-content"></div>
  `);
  renderAddContent();
}

function renderAddContent() {
  const c = $('#add-content');
  if (!c) return;
  if (ui.addTab === 'photo') return renderPhotoTab(c);
  if (ui.addTab === 'foods') return renderFoodsTab(c);
  c.innerHTML = manualForm({});
}

function manualForm(e) {
  return `
    <div class="field"><span>Nom</span><input class="input" id="m-name" value="${esc(e.name || '')}" placeholder="Ex : Bol de pâtes bolo"></div>
    <div class="grid2">
      <label class="field"><span>Calories (kcal)</span><input class="input" id="m-kcal" inputmode="decimal" value="${e.kcal ?? ''}"></label>
      <label class="field"><span>Quantité (g, optionnel)</span><input class="input" id="m-grams" inputmode="decimal" value="${e.grams || ''}"></label>
    </div>
    <div class="grid2" style="grid-template-columns:repeat(3,1fr)">
      <label class="field"><span>Protéines g</span><input class="input" id="m-p" inputmode="decimal" value="${e.protein ?? ''}"></label>
      <label class="field"><span>Glucides g</span><input class="input" id="m-c" inputmode="decimal" value="${e.carbs ?? ''}"></label>
      <label class="field"><span>Lipides g</span><input class="input" id="m-f" inputmode="decimal" value="${e.fat ?? ''}"></label>
    </div>
    <p class="muted small" style="margin:-4px 0 10px">Astuce : si tu laisses les calories vides, elles sont calculées à partir des macros (P×4 + G×4 + L×9).</p>
    <button class="btn primary block" data-action="${e.id ? 'save-edit' : 'save-manual'}" ${e.id ? `data-id="${e.id}"` : ''}>${e.id ? 'Enregistrer' : 'Ajouter'}</button>
  `;
}

function readManual() {
  const p = num($('#m-p').value) || 0;
  const c = num($('#m-c').value) || 0;
  const f = num($('#m-f').value) || 0;
  let kcal = num($('#m-kcal').value);
  if (kcal == null) kcal = p * 4 + c * 4 + f * 9;
  const name = $('#m-name').value.trim() || 'Aliment';
  if (!kcal) { toast('Indique au moins les calories ou les macros.'); return null; }
  return { name, kcal: round(kcal), protein: round(p), carbs: round(c), fat: round(f), grams: round(num($('#m-grams').value) || 0) };
}

function addEntries(items) {
  const day = dayData(ui.date, true);
  snapshotTarget(ui.date);
  for (const it of items) {
    day.entries.push({ id: uid(), meal: ui.addMeal, ...it });
    rememberRecent(it);
  }
  save();
  closeSheet();
  render();
  const k = items.reduce((s, i) => s + i.kcal, 0);
  toast(`+${fmt(k)} kcal ajoutées`);
}

function rememberRecent(it) {
  if (it.fromPhoto) return;
  const key = it.name.toLowerCase();
  state.recents = [{ name: it.name, kcal: it.kcal, protein: it.protein, carbs: it.carbs, fat: it.fat, grams: it.grams || 0 },
    ...state.recents.filter((r) => r.name.toLowerCase() !== key)].slice(0, 15);
}

/* ---------- Base d'aliments ---------- */
function renderFoodsTab(c) {
  c.innerHTML = `
    <input class="input" id="food-q" placeholder="Rechercher (poulet, riz, banane…)" autocomplete="off">
    <ul class="food-list" id="food-list"></ul>
    <div id="food-pick"></div>
  `;
  const q = $('#food-q');
  q.addEventListener('input', () => drawFoodList(q.value));
  drawFoodList('');
}

const normalize = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function drawFoodList(query) {
  const list = $('#food-list');
  const q = normalize(query.trim());
  const recents = !q ? state.recents.map((r, i) => ({ ...r, recentIdx: i })) : [];
  const foods = FOODS.map((f, i) => ({ ...f, idx: i })).filter((f) => !q || normalize(f.n).includes(q));
  list.innerHTML =
    (recents.length ? `<li class="muted small" style="padding:6px 4px">Récents</li>` : '') +
    recents.map((r) => `<li><button data-action="pick-recent" data-i="${r.recentIdx}"><span>${esc(r.name)}</span><span class="per">${fmt(r.kcal)} kcal</span></button></li>`).join('') +
    (recents.length ? `<li class="muted small" style="padding:10px 4px 6px">Base d'aliments (pour 100 g)</li>` : '') +
    foods.map((f) => `<li><button data-action="pick-food" data-i="${f.idx}"><span>${esc(f.n)}</span><span class="per">${f.k} kcal · P${f.p}</span></button></li>`).join('') +
    (!foods.length && !recents.length ? '<li class="muted small" style="padding:12px 4px">Aucun résultat. Utilise l\'onglet « Manuel » ou « Photo IA ».</li>' : '');
}

function pickFood(i) {
  const f = FOODS[i];
  $('#food-list').hidden = true;
  $('#food-q').hidden = true;
  const box = $('#food-pick');
  box.innerHTML = `
    <div class="card" style="margin:0">
      <div class="row between"><h3>${esc(f.n)}</h3><button class="btn" data-action="add-tab" data-tab="foods" style="padding:6px 10px">Changer</button></div>
      <label class="field" style="margin-top:12px"><span>Quantité (g)</span><input class="input" id="food-g" inputmode="decimal" value="${f.unit}"></label>
      <div class="kv" id="food-calc"></div>
      <button class="btn primary block" style="margin-top:14px" data-action="add-food" data-i="${i}">Ajouter</button>
    </div>`;
  const g = $('#food-g');
  const draw = () => {
    const v = foodValues(f, num(g.value) || 0);
    $('#food-calc').innerHTML = `<span>Calories</span><b>${fmt(v.kcal)} kcal</b><span>Protéines</span><b>${fmt(v.protein)} g</b><span>Glucides</span><b>${fmt(v.carbs)} g</b><span>Lipides</span><b>${fmt(v.fat)} g</b>`;
  };
  g.addEventListener('input', draw);
  draw();
  g.focus();
  g.select();
}

function foodValues(f, grams) {
  const r = grams / 100;
  return { name: f.n, grams: round(grams), kcal: round(f.k * r), protein: round(f.p * r), carbs: round(f.c * r), fat: round(f.f * r) };
}

/* ---------- Photo IA ---------- */
let photoState = null; // { dataUrl, base64, thumb, result, loading, error }

function renderPhotoTab(c) {
  const s = state.settings;
  const hasKey = !!s.keys[s.provider];
  if (!photoState) {
    c.innerHTML = `
      ${!hasKey ? `<div class="note warn" style="margin:0 0 12px">Pour l'analyse photo, ajoute une clé API gratuite dans <b>Profil → Analyse photo IA</b>. <button class="btn" data-action="goto-ai-settings" style="padding:6px 10px;margin-top:8px">Configurer</button></div>` : ''}
      <label class="photo-drop">
        ${ICON.camera}
        <b>Prendre ou choisir une photo</b>
        <span>L'IA identifie les aliments et estime les calories</span>
        <input type="file" accept="image/*" id="photo-input" hidden>
      </label>
      <p class="muted small" style="margin:10px 0 0">💡 Photographie le plat de dessus, avec les couverts visibles pour l'échelle. L'estimation reste approximative (±20 %).</p>
    `;
    $('#photo-input').addEventListener('change', onPhotoChosen);
    return;
  }
  const p = photoState;
  c.innerHTML = `
    <img class="preview" src="${p.dataUrl}" alt="Photo du repas">
    <label class="field" style="margin-top:12px"><span>Précision (optionnel)</span>
      <input class="input" id="photo-hint" placeholder="Ex : sauce à la crème, 2 œufs, portion XL" value="${esc(p.hint || '')}"></label>
    ${p.loading ? `<div class="row" style="justify-content:center;padding:16px"><div class="spinner"></div><span class="muted">Analyse en cours…</span></div>` : ''}
    ${p.error ? `<div class="note warn">${esc(p.error)}</div>` : ''}
    ${!p.loading && !p.result ? `<div class="btn-row"><button class="btn" data-action="photo-reset">Autre photo</button><button class="btn primary" data-action="photo-analyze">Analyser</button></div>` : ''}
    ${p.result ? photoResult(p.result) : ''}
  `;
}

function photoResult(r) {
  if (!r.items.length) {
    return `<div class="note warn">${esc(r.notes || 'Aucun aliment détecté.')}</div>
      <div class="btn-row"><button class="btn" data-action="photo-reset">Autre photo</button></div>`;
  }
  const t = r.items.reduce((a, i) => ({ kcal: a.kcal + i.kcal, p: a.p + i.protein, c: a.c + i.carbs, f: a.f + i.fat }), { kcal: 0, p: 0, c: 0, f: 0 });
  return `
    <div class="card" style="margin:12px 0 0">
      <div class="row between">
        <h3>${esc(r.dish)}</h3>
        <span class="small muted">Confiance : ${esc(r.confidence)}</span>
      </div>
      <div class="goal on" style="margin:10px 0">
        <div class="kcal tnum" id="ai-total">${fmt(t.kcal)} <small>kcal</small></div>
        <div class="detail" id="ai-macros">P ${fmt(t.p)} g · G ${fmt(t.c)} g · L ${fmt(t.f)} g</div>
      </div>
      <p class="small muted" style="margin:0 0 6px">Corrige si besoin :</p>
      ${r.items.map((i, k) => `
        <div class="ai-item" data-k="${k}">
          <input class="input" data-ai="name" value="${esc(i.name)}">
          <div class="grid4">
            <label>g<input class="input" data-ai="grams" inputmode="decimal" value="${i.grams}"></label>
            <label>kcal<input class="input" data-ai="kcal" inputmode="decimal" value="${i.kcal}"></label>
            <label>P<input class="input" data-ai="protein" inputmode="decimal" value="${i.protein}"></label>
            <label>G / L<input class="input" data-ai="carbsfat" value="${i.carbs}/${i.fat}"></label>
          </div>
        </div>`).join('')}
      ${r.notes ? `<div class="note">${esc(r.notes)}</div>` : ''}
      <label class="row small" style="margin-top:12px"><input type="checkbox" id="ai-combine" checked> Ajouter comme un seul plat</label>
      <div class="btn-row">
        <button class="btn" data-action="photo-analyze">Réanalyser</button>
        <button class="btn primary" data-action="photo-add">Ajouter</button>
      </div>
    </div>`;
}

function readAiItems() {
  return [...document.querySelectorAll('.ai-item')].map((row) => {
    const get = (k) => row.querySelector(`[data-ai="${k}"]`).value;
    const [c, f] = get('carbsfat').split('/').map((v) => round(num(v) || 0));
    return { name: get('name').trim() || 'Aliment', grams: round(num(get('grams'))), kcal: round(num(get('kcal'))), protein: round(num(get('protein'))), carbs: c || 0, fat: f || 0 };
  });
}

function refreshAiTotal() {
  const items = readAiItems();
  const t = items.reduce((a, i) => ({ kcal: a.kcal + i.kcal, p: a.p + i.protein, c: a.c + i.carbs, f: a.f + i.fat }), { kcal: 0, p: 0, c: 0, f: 0 });
  const tot = $('#ai-total');
  if (tot) tot.innerHTML = `${fmt(t.kcal)} <small>kcal</small>`;
  const mac = $('#ai-macros');
  if (mac) mac.textContent = `P ${fmt(t.p)} g · G ${fmt(t.c)} g · L ${fmt(t.f)} g`;
}

async function onPhotoChosen(ev) {
  const file = ev.target.files?.[0];
  if (!file) return;
  try {
    const img = await resizeImage(file, 1024, 0.85);
    const thumb = await makeThumb(img.dataUrl);
    photoState = { ...img, thumb };
    renderAddContent();
    if (state.settings.keys[state.settings.provider]) runAnalysis();
  } catch (e) {
    toast(e.message);
  }
}

function makeThumb(dataUrl, size = 96) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const s = Math.min(img.width, img.height);
      c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      resolve(c.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

async function runAnalysis() {
  if (!photoState) return;
  const s = state.settings;
  if (!s.keys[s.provider]) { toast('Ajoute ta clé API dans Profil.'); return; }
  photoState.hint = $('#photo-hint')?.value.trim() || photoState.hint || '';
  photoState.loading = true;
  photoState.error = null;
  photoState.result = null;
  renderAddContent();
  const current = photoState;
  try {
    const result = await analyzeMeal({
      provider: s.provider,
      apiKey: s.keys[s.provider],
      model: s.models[s.provider],
      base64: current.base64,
      hint: current.hint,
    });
    if (photoState !== current) return;
    current.result = result;
  } catch (e) {
    if (photoState !== current) return;
    current.error = e.message || 'Erreur pendant l\'analyse.';
  }
  current.loading = false;
  renderAddContent();
}

function addPhotoEntries() {
  const items = readAiItems();
  if (!items.length) return;
  const thumb = photoState?.thumb || null;
  const combine = $('#ai-combine')?.checked;
  if (combine) {
    const t = items.reduce((a, i) => ({ kcal: a.kcal + i.kcal, protein: a.protein + i.protein, carbs: a.carbs + i.carbs, fat: a.fat + i.fat, grams: a.grams + i.grams }), { kcal: 0, protein: 0, carbs: 0, fat: 0, grams: 0 });
    addEntries([{ name: photoState.result.dish, ...t, thumb, items, fromPhoto: true }]);
  } else {
    addEntries(items.map((i) => ({ ...i, thumb, fromPhoto: true })));
  }
}

/* ---------- Modifier une entrée ---------- */
function openEdit(id) {
  const e = dayData(ui.date).entries.find((x) => x.id === id);
  if (!e) return;
  openSheet(`
    <div class="row between"><h2>Modifier</h2><button class="icon-btn btn danger" data-action="delete-entry" data-id="${id}" aria-label="Supprimer">${ICON.trash}</button></div>
    ${e.thumb ? `<img class="preview" src="${e.thumb}" alt="" style="max-height:140px;margin-bottom:12px">` : ''}
    <div class="field"><span>Repas</span>${mealSelect(e.meal, 'id="m-meal"')}</div>
    ${manualForm(e)}
    ${e.items?.length ? `<details class="help" style="margin-top:14px"><summary>Détail de l'estimation photo</summary>
      <div class="kv">${e.items.map((i) => `<span>${esc(i.name)} (${fmt(i.grams)} g)</span><b>${fmt(i.kcal)} kcal</b>`).join('')}</div></details>` : ''}
  `);
}

/* ---------- Dépense active (app Santé) ---------- */
const SHORTCUT_NAME = 'NutriTrack Santé';

// Accepte « 452 », « 452,7 kcal », « active=452 »…
function parseHealthText(text) {
  const t = String(text || '');
  const m = t.match(/active\s*[=:]\s*([\d\s\u00a0\u202f.,]+)/i) || t.match(/([\d][\d\s\u00a0\u202f]*[.,]?\d*)/);
  const v = m ? num(m[1]) : null;
  return v != null && v >= 0 && v < 10000 ? Math.round(v) : null;
}

function setActive(date, kcal) {
  const d = dayData(date, true);
  if (kcal == null) delete d.active;
  else d.active = kcal;
  save();
  render();
}

function openActivity() {
  const d = dayData(ui.date);
  openSheet(`
    <h2>🔥 Calories actives · ${esc(dateLabel(ui.date))}</h2>
    <label class="field"><span>Calories actives dépensées (kcal)</span>
      <input class="input" id="act-val" inputmode="decimal" value="${d.active ?? ''}" placeholder="Ex : 520"></label>
    <div class="btn-row" style="margin-top:0">
      <button class="btn" data-action="paste-activity">📋 Coller</button>
      ${isIos() ? '<button class="btn" data-action="run-shortcut">⚡ Raccourci Santé</button>' : ''}
    </div>
    <div class="btn-row">
      ${d.active != null ? '<button class="btn danger" data-action="clear-activity">Effacer</button>' : ''}
      <button class="btn primary" data-action="save-activity">Enregistrer</button>
    </div>
    <p class="small muted">Dans l'app Santé de l'iPhone : <b>Parcourir → Activité → Énergie active</b> (le total du jour). Sur Android : Google Fit, Samsung Health… (calories d'activité).</p>
    <details class="help">
      <summary>⚡ Importer automatiquement depuis Apple Santé</summary>
      <div class="small">
        <p class="muted" style="margin:0 0 8px">Apple ne laisse pas les web apps lire Santé directement. On crée donc un raccourci (une seule fois) qui copie ta dépense du jour, puis tu la colles ici.</p>
        <ol style="padding-left:18px;margin:0;display:grid;gap:6px">
          <li>Ouvre l'app <b>Raccourcis</b> → <b>+</b> (nouveau raccourci).</li>
          <li>Renomme-le exactement : <b>${SHORTCUT_NAME}</b></li>
          <li>Ajoute l'action <b>« Rechercher des échantillons de santé »</b> : Type = <b>Énergie active</b>, puis ajoute le filtre <b>Date de début</b> → <b>est aujourd'hui</b>.</li>
          <li>Ajoute <b>« Calculer les statistiques »</b> → <b>Somme</b>.</li>
          <li>Ajoute <b>« Copier dans le presse-papiers »</b>.</li>
          <li>Lance-le une fois et autorise l'accès à Santé.</li>
        </ol>
        <p class="muted" style="margin:8px 0 0">Ensuite : touche <b>⚡ Raccourci Santé</b>, reviens dans NutriTrack (bouton ◀ en haut à gauche) et touche <b>📋 Coller</b>.</p>
      </div>
    </details>
  `);
}

async function pasteActivity() {
  try {
    const text = await navigator.clipboard.readText();
    const v = parseHealthText(text);
    if (v == null) { toast('Aucun nombre trouvé dans le presse-papiers.'); return; }
    const input = $('#act-val');
    if (input) input.value = v;
    toast(`${fmt(v)} kcal collées — touche Enregistrer`);
  } catch {
    toast('Collage refusé : appuie longuement dans le champ puis « Coller ».');
  }
}

/* ---------- Rappels ---------- */
function setRem(path, value) {
  const keys = path.split('.');
  let o = state.settings.reminders;
  for (const k of keys.slice(0, -1)) o = o[k];
  o[keys.at(-1)] = value;
  save();
}

async function onReminderInput(el) {
  const path = el.dataset.rem;
  const value = el.type === 'checkbox' ? el.checked : el.value;
  if (path === 'enabled' && value) {
    const perm = await requestPermission();
    if (perm !== 'granted') {
      el.checked = false;
      toast(perm === 'unsupported' ? 'Notifications indisponibles ici : utilise le Calendrier.' : 'Notifications refusées.');
      setRem('enabled', false);
      renderProfile();
      return;
    }
    toast('Rappels activés ✅');
  }
  setRem(path, path === 'water.everyMin' ? Number(value) : value);
  checkReminders();
}

function checkReminders() {
  const cfg = state.settings.reminders;
  if (!cfg.enabled) return;
  const today = todayIso();
  if (state.sent.date !== today) state.sent = { date: today, keys: [] };
  const day = dayData(today);
  const plan = currentPlan();
  const due = dueReminders(cfg, {
    now: new Date(),
    meals: MEALS,
    loggedMeals: new Set(day.entries.map((e) => e.meal)),
    waterCount: day.water || 0,
    waterGoal: plan ? Math.ceil(plan.waterL / 0.25) : 8,
    sent: new Set(state.sent.keys),
  });
  if (!due.length) return;
  for (const r of due) {
    notify(r.title, r.body, r.key);
    state.sent.keys.push(r.key);
  }
  save();
}

function exportIcs() {
  const ics = buildIcs(state.settings.reminders, MEALS);
  if (!ics.includes('BEGIN:VEVENT')) { toast('Active au moins un rappel (eau ou repas).'); return; }
  const file = new File([ics], 'nutritrack-rappels.ics', { type: 'text/calendar' });
  // Sur iPhone, ouvrir le fichier .ics propose directement « Ajouter tout » au Calendrier.
  if (isIos()) {
    const url = URL.createObjectURL(file);
    window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Fichier téléchargé : ouvre-le pour l\'ajouter à ton agenda.');
}

/* =========================================================
   Vue : Calendrier
   ========================================================= */
function dayStatus(date) {
  const d = state.days[date];
  if (!d || !d.entries?.length) return null;
  const t = targetFor(date);
  if (!t) return 'ok';
  const r = totals(d).kcal / t.kcal;
  return r < 0.9 ? 'under' : r > 1.1 ? 'over' : 'ok';
}

function renderCalendar() {
  const el = $('#view-calendar');
  const [y, m] = ui.calMonth.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const daysInMonth = new Date(y, m, 0).getDate();
  const offset = (first.getDay() + 6) % 7; // lundi = 0
  const today = todayIso();

  let logged = 0, inTarget = 0, sum = 0;
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push('<div class="cal-day empty"></div>');
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${y}-${pad(m)}-${pad(d)}`;
    const st = dayStatus(date);
    if (st) { logged++; sum += totals(state.days[date]).kcal; if (st === 'ok') inTarget++; }
    cells.push(`<button class="cal-day ${st || ''} ${date === today ? 'today' : ''} ${date > today ? 'future' : ''}" data-action="cal-open" data-date="${date}">
      ${d}<span class="dot"></span></button>`);
  }

  const monthLabel = first.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  el.innerHTML = `
    <div class="page-head"><h1>Calendrier</h1></div>
    <div class="card">
      <div class="cal-head">
        <button class="icon-btn" data-action="cal-prev" aria-label="Mois précédent">${ICON.left}</button>
        <span class="label">${monthLabel}</span>
        <button class="icon-btn" data-action="cal-next" aria-label="Mois suivant">${ICON.right}</button>
      </div>
      <div class="cal-grid">
        ${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d) => `<div class="cal-dow">${d}</div>`).join('')}
        ${cells.join('')}
      </div>
      <div class="legend">
        <span><i style="background:var(--accent)"></i>Objectif atteint (±10 %)</span>
        <span><i style="background:var(--fat)"></i>En dessous</span>
        <span><i style="background:var(--warn)"></i>Au-dessus</span>
      </div>
    </div>
    <div class="card">
      <h2>Bilan du mois</h2>
      <div class="stats3">
        <div><div class="v">${logged}</div><div class="l">jours suivis</div></div>
        <div><div class="v">${logged ? fmt(sum / logged) : '—'}</div><div class="l">kcal / jour (moy.)</div></div>
        <div><div class="v">${logged ? Math.round((inTarget / logged) * 100) + ' %' : '—'}</div><div class="l">dans l'objectif</div></div>
      </div>
    </div>
    <p class="muted small" style="text-align:center">Touche un jour pour voir ou modifier ce que tu as mangé.</p>
  `;
}

/* =========================================================
   Vue : Poids
   ========================================================= */
function renderWeight() {
  const el = $('#view-weight');
  const entries = Object.keys(state.days).filter((k) => state.days[k].weight).sort().map((date) => ({ date, w: state.days[date].weight, bf: state.days[date].bodyFat }));
  const todayEntry = state.days[todayIso()];
  const last = entries.at(-1);
  const first = entries[0];
  const plan = currentPlan();

  el.innerHTML = `
    <div class="page-head"><h1>Poids</h1></div>
    <div class="card">
      <h2>Nouvelle pesée</h2>
      <div class="grid2">
        <label class="field"><span>Poids (kg)</span><input class="input" id="w-val" inputmode="decimal" placeholder="${last ? fmt1(last.w) : '75'}" value="${todayEntry?.weight ?? ''}"></label>
        <label class="field"><span>Masse grasse %</span><input class="input" id="w-bf" inputmode="decimal" placeholder="optionnel" value="${todayEntry?.bodyFat ?? ''}"></label>
      </div>
      <label class="field"><span>Date</span><input class="input" type="date" id="w-date" value="${todayIso()}" max="${todayIso()}"></label>
      <button class="btn primary block" data-action="save-weight">Enregistrer</button>
      <p class="muted small" style="margin:10px 0 0">Ta dernière pesée met automatiquement à jour ton profil et ton quota de calories.</p>
    </div>

    ${entries.length >= 2 ? `
    <div class="card">
      <div class="row between"><h2 style="margin:0">Évolution</h2>
        <span class="small ${last.w - first.w > 0 ? 'delta-up' : 'delta-down'}">${last.w - first.w > 0 ? '+' : ''}${fmt1(last.w - first.w)} kg depuis le ${parseIso(first.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
      </div>
      ${weightChart(entries.slice(-60))}
      ${trendNote(entries, plan)}
    </div>` : ''}

    <div class="card">
      <h2>Historique</h2>
      ${entries.length ? `<ul class="history">${entries.slice().reverse().slice(0, 40).map((e, i, arr) => {
        const prev = arr[i + 1];
        const d = prev ? e.w - prev.w : 0;
        return `<li><span>${parseIso(e.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
          <span>${prev ? `<span class="small ${d > 0 ? 'delta-up' : 'delta-down'}">${d > 0 ? '+' : ''}${fmt1(d)}</span> · ` : ''}<b>${fmt1(e.w)} kg</b>${e.bf ? ` <span class="muted small">${fmt1(e.bf)} %</span>` : ''}
          <button class="icon-btn" style="width:28px;height:28px;display:inline-grid;vertical-align:middle;margin-left:6px" data-action="delete-weight" data-date="${e.date}" aria-label="Supprimer">${ICON.trash}</button></span></li>`;
      }).join('')}</ul>` : '<div class="empty-state"><div class="emoji">⚖️</div><p class="muted">Aucune pesée pour l\'instant.</p></div>'}
    </div>
  `;
}

function weightChart(entries) {
  const W = 340, H = 190, pl = 34, pr = 10, pt = 12, pb = 22;
  const ws = entries.map((e) => e.w);
  let min = Math.min(...ws), max = Math.max(...ws);
  if (max - min < 2) { const mid = (max + min) / 2; min = mid - 1; max = mid + 1; }
  const t0 = parseIso(entries[0].date).getTime();
  const t1 = parseIso(entries.at(-1).date).getTime();
  const x = (d) => pl + ((parseIso(d).getTime() - t0) / Math.max(t1 - t0, 1)) * (W - pl - pr);
  const y = (w) => pt + (1 - (w - min) / (max - min)) * (H - pt - pb);
  const pts = entries.map((e) => `${x(e.date).toFixed(1)},${y(e.w).toFixed(1)}`);
  const ticks = [min, (min + max) / 2, max];
  return `
    <svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Courbe de poids">
      ${ticks.map((t) => `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${y(t)}" y2="${y(t)}"/><text x="${pl - 6}" y="${y(t) + 3}" text-anchor="end">${fmt1(t)}</text>`).join('')}
      <path class="area" d="M${pts[0]} L${pts.join(' L')} L${x(entries.at(-1).date)},${H - pb} L${x(entries[0].date)},${H - pb} Z"/>
      <polyline class="line" points="${pts.join(' ')}"/>
      ${entries.length <= 31 ? entries.map((e) => `<circle class="pt" cx="${x(e.date)}" cy="${y(e.w)}" r="3"/>`).join('') : ''}
      <text x="${pl}" y="${H - 6}">${parseIso(entries[0].date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</text>
      <text x="${W - pr}" y="${H - 6}" text-anchor="end">${parseIso(entries.at(-1).date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</text>
    </svg>`;
}

function trendNote(entries, plan) {
  const recent = entries.filter((e) => parseIso(e.date) >= parseIso(addDays(todayIso(), -28)));
  if (recent.length < 2) return '';
  const days = (parseIso(recent.at(-1).date) - parseIso(recent[0].date)) / 86400000;
  if (days < 7) return '';
  const perWeek = ((recent.at(-1).w - recent[0].w) / days) * 7;
  let advice = '';
  if (plan) {
    const g = state.profile.goal;
    if (g === 'cut' && perWeek > -0.1) advice = ' Ta perte stagne : réduis d\'environ 150 kcal/jour ou bouge un peu plus.';
    if (g === 'cut' && perWeek < -1.0) advice = ' Tu perds vite : attention à préserver ton muscle (ajoute ~150 kcal/jour).';
    if (g === 'bulk' && perWeek < 0.1) advice = ' Tu ne prends pas : ajoute environ 150 kcal/jour.';
    if (g === 'bulk' && perWeek > 0.5) advice = ' Tu prends vite : réduis d\'environ 150 kcal/jour pour limiter le gras.';
  }
  return `<div class="note">Tendance sur 4 semaines : <b>${perWeek > 0 ? '+' : ''}${fmt1(perWeek)} kg / semaine</b>.${advice}</div>`;
}

/* =========================================================
   Vue : Profil & réglages
   ========================================================= */
function renderProfile() {
  const el = $('#view-profile');
  const p = state.profile;
  const s = state.settings;
  const prov = PROVIDERS[s.provider];
  el.innerHTML = `
    <div class="page-head"><h1>Profil</h1></div>
    <p class="subtitle">Tes données servent à calculer ton quota. Elles restent uniquement sur ton téléphone.</p>

    <div class="card">
      <h2>Mes données</h2>
      <div class="field"><span>Sexe</span>
        <div class="seg">
          <button class="${p.sex === 'male' ? 'on' : ''}" data-action="set-sex" data-v="male">Homme</button>
          <button class="${p.sex === 'female' ? 'on' : ''}" data-action="set-sex" data-v="female">Femme</button>
        </div>
      </div>
      <div class="grid2">
        <label class="field"><span>Âge</span><input class="input" data-profile="age" inputmode="numeric" value="${p.age ?? ''}" placeholder="25"></label>
        <label class="field"><span>Taille (cm)</span><input class="input" data-profile="heightCm" inputmode="decimal" value="${p.heightCm ?? ''}" placeholder="178"></label>
        <label class="field"><span>Poids (kg)</span><input class="input" data-profile="weightKg" inputmode="decimal" value="${p.weightKg ?? ''}" placeholder="75"></label>
        <label class="field"><span>Masse grasse %</span><input class="input" data-profile="bodyFat" id="bf-input" inputmode="decimal" value="${p.bodyFat ?? ''}" placeholder="optionnel"></label>
      </div>
      <details class="help">
        <summary>Je ne connais pas mon % de masse grasse</summary>
        <p class="small muted" style="margin:0 0 10px">Estimation avec un mètre ruban (méthode US Navy). Tour de taille au niveau du nombril, cou sous la pomme d'Adam${p.sex === 'female' ? ', hanches au plus large' : ''}.</p>
        <div class="grid2">
          <label class="field"><span>Tour de taille (cm)</span><input class="input" id="navy-waist" inputmode="decimal"></label>
          <label class="field"><span>Tour de cou (cm)</span><input class="input" id="navy-neck" inputmode="decimal"></label>
          ${p.sex === 'female' ? '<label class="field"><span>Tour de hanches (cm)</span><input class="input" id="navy-hip" inputmode="decimal"></label>' : ''}
        </div>
        <button class="btn block" data-action="navy">Estimer ma masse grasse</button>
      </details>
      <label class="field" style="margin-top:12px"><span>Niveau d'activité</span>
        <select class="input" data-profile="activity">
          ${ACTIVITY_LEVELS.map((a) => `<option value="${a.id}" ${p.activity === a.id ? 'selected' : ''}>${a.label} — ${a.hint}</option>`).join('')}
        </select>
      </label>
      <div class="field"><span>Rythme pour sèche / prise de masse</span>
        <div class="seg">${INTENSITIES.map((i) => `<button class="${p.intensity === i.id ? 'on' : ''}" data-action="set-intensity" data-v="${i.id}">${i.label}</button>`).join('')}</div>
      </div>
    </div>

    <div id="plan-results"></div>

    <div class="card" id="ai-settings">
      <h2>📷 Analyse photo IA</h2>
      <div class="field"><span>Service</span>
        <div class="seg">
          <button class="${s.provider === 'gemini' ? 'on' : ''}" data-action="set-provider" data-v="gemini">Gemini · gratuit</button>
          <button class="${s.provider === 'claude' ? 'on' : ''}" data-action="set-provider" data-v="claude">Claude · payant</button>
        </div>
      </div>
      <label class="field"><span>Clé API ${s.provider === 'gemini' ? 'Google AI Studio' : 'Anthropic'}</span>
        <input class="input" id="api-key" type="password" autocomplete="off" value="${esc(s.keys[s.provider])}" placeholder="Colle ta clé ici"></label>
      ${s.provider === 'claude'
        ? `<label class="field"><span>Modèle</span><select class="input" id="api-model">${CLAUDE_MODELS.map((m) => `<option value="${m.id}" ${s.models.claude === m.id ? 'selected' : ''}>${m.label}</option>`).join('')}</select></label>`
        : `<label class="field"><span>Modèle</span><input class="input" id="api-model" value="${esc(s.models.gemini)}"></label>`}
      <p class="small muted" style="margin:0">${esc(prov.keyHelp)}${s.provider === 'gemini' ? ' Gratuit, sans carte bancaire, dans la limite du quota gratuit de Google. Les photos envoyées via l\'offre gratuite peuvent être utilisées par Google pour améliorer ses services.' : ' Coût indicatif : moins d\'un centime par photo avec Haiku.'}</p>
      <button class="btn block" style="margin-top:12px" data-action="save-ai">Enregistrer</button>
    </div>

    ${remindersCard()}

    <div class="card">
      <h2>🔥 Dépense réelle (app Santé)</h2>
      <label class="row small" style="gap:10px">
        <input type="checkbox" data-action="toggle-active" ${state.settings.useActive ? 'checked' : ''}>
        <span>Adapter mon objectif du jour à mes calories actives</span>
      </label>
      <p class="small muted" style="margin:10px 0 0">Quand tu importes ta dépense active du jour (Apple Santé, montre…), ton objectif devient :
        métabolisme de base + 10 % + calories actives, puis l'ajustement sèche / prise de masse.
        Sans import, on garde le calcul classique avec ton niveau d'activité.</p>
      <button class="btn block" style="margin-top:12px" data-action="open-activity">Importer la dépense du jour</button>
    </div>

    <div class="card">
      <h2>💾 Mes données</h2>
      <p class="small muted" style="margin:0 0 10px">Tout est enregistré sur cet appareil. Exporte régulièrement une sauvegarde pour ne rien perdre (changement de téléphone, nettoyage du navigateur…).</p>
      <div class="btn-row" style="margin-top:0">
        <button class="btn" data-action="export">Exporter</button>
        <label class="btn" style="cursor:pointer">Importer<input type="file" accept="application/json" id="import-file" hidden></label>
      </div>
      <button class="btn danger block" style="margin-top:8px" data-action="reset">Tout effacer</button>
    </div>
    <p class="muted small" style="text-align:center">Les calculs sont des estimations (Mifflin-St Jeor / Katch-McArdle). Ils ne remplacent pas l'avis d'un professionnel de santé.</p>
  `;
  renderPlanResults();
  $('#import-file').addEventListener('change', importData);
}

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;

function remindersCard() {
  const r = state.settings.reminders;
  const perm = notificationsSupported() ? Notification.permission : 'unsupported';
  return `
    <div class="card" id="reminders">
      <h2>🔔 Rappels</h2>
      <label class="row small" style="gap:10px">
        <input type="checkbox" data-rem="enabled" ${r.enabled ? 'checked' : ''}>
        <span>Activer les notifications de l'app</span>
      </label>
      ${perm === 'denied' ? '<div class="note warn">Les notifications sont bloquées. Autorise-les dans les réglages du téléphone (Réglages → Notifications → NutriTrack).</div>' : ''}
      ${perm === 'unsupported' ? `<div class="note warn">${isIos() && !isStandalone() ? 'Sur iPhone, les notifications ne marchent que si l\'app est installée sur l\'écran d\'accueil.' : 'Ce navigateur ne gère pas les notifications.'} Utilise plutôt le bouton Calendrier ci-dessous.</div>` : ''}

      <h3 style="margin:16px 0 8px">💧 Eau</h3>
      <label class="row small" style="gap:10px;margin-bottom:8px"><input type="checkbox" data-rem="water.on" ${r.water.on ? 'checked' : ''}><span>Me rappeler de boire</span></label>
      <div class="grid2" style="grid-template-columns:1fr 1fr 1fr">
        <label class="field"><span>De</span><input class="input" type="time" data-rem="water.start" value="${r.water.start}"></label>
        <label class="field"><span>À</span><input class="input" type="time" data-rem="water.end" value="${r.water.end}"></label>
        <label class="field"><span>Fréquence</span>
          <select class="input" data-rem="water.everyMin">${[60, 90, 120, 180].map((m) => `<option value="${m}" ${Number(r.water.everyMin) === m ? 'selected' : ''}>${m < 120 ? m + ' min' : m / 60 + ' h'}</option>`).join('')}</select></label>
      </div>

      <h3 style="margin:8px 0 8px">🍽️ Repas</h3>
      ${MEALS.map((m) => `
        <div class="row" style="margin-bottom:8px">
          <label class="row small grow" style="gap:10px"><input type="checkbox" data-rem="meals.${m.id}.on" ${r.meals[m.id].on ? 'checked' : ''}><span>${m.emoji} ${m.label}</span></label>
          <input class="input" type="time" style="width:120px" data-rem="meals.${m.id}.time" value="${r.meals[m.id].time}">
        </div>`).join('')}
      <p class="small muted" style="margin:4px 0 0">Le rappel repas n'est pas envoyé si tu as déjà noté ce repas. Le rappel eau s'arrête quand ton objectif d'eau est atteint.</p>
      <button class="btn block" style="margin-top:12px" data-action="test-notif">Tester une notification</button>

      <div class="note" style="margin-top:14px">
        <b>📅 Rappels même quand l'app est fermée</b><br>
        Une web app ne peut pas se réveiller toute seule. Pour des rappels 100 % fiables, ajoute-les à l'app Calendrier de ton téléphone :
        des alertes quotidiennes aux heures choisies ci-dessus.
        <button class="btn primary block" style="margin-top:10px" data-action="export-ics">Ajouter au Calendrier</button>
      </div>
    </div>`;
}

function renderPlanResults() {
  const box = $('#plan-results');
  if (!box) return;
  const plan = currentPlan();
  if (!plan) {
    box.innerHTML = `<div class="card"><p class="muted small" style="margin:0">Remplis âge, taille et poids pour voir ton quota de calories.</p></div>`;
    return;
  }
  const g = state.profile.goal;
  const goalCard = (x) => `
    <button class="goal ${x.id === g ? 'on' : ''}" data-action="set-goal" data-v="${x.id}">
      <div class="top">
        <span class="title">${x.emoji} ${x.label}${x.id === g ? '<span class="badge">Mon objectif</span>' : ''}</span>
        <span class="kcal">${fmt(x.kcal)} <small>kcal/j</small></span>
      </div>
      <div class="detail">P ${x.macros.protein} g · G ${x.macros.carbs} g · L ${x.macros.fat} g
        ${x.id !== 'maintain' ? ` · ${x.deltaPct > 0 ? '+' : ''}${x.deltaPct} % · ≈ ${x.weeklyKg > 0 ? '+' : ''}${fmt1(x.weeklyKg)} kg/sem.` : ''}</div>
    </button>`;
  box.innerHTML = `
    <div class="card">
      <h2>🎯 Mon quota de calories</h2>
      <div class="goals">${['cut', 'maintain', 'bulk'].map((id) => goalCard(plan.goals[id])).join('')}</div>
      ${plan.goals[g].belowBmr ? '<div class="note warn">⚠️ Cet objectif est sous ton métabolisme de base. Préfère un rythme plus doux sur la durée.</div>' : ''}
      <p class="small muted" style="margin:10px 0 0">Touche une carte pour choisir ton objectif : il s'applique à ton suivi quotidien.</p>
    </div>
    <div class="card">
      <h2>📊 Détails</h2>
      <div class="kv">
        <span>Métabolisme de base</span><b>${fmt(plan.bmr)} kcal</b>
        <span>Dépense totale (maintien)</span><b>${fmt(plan.tdee)} kcal</b>
        <span>IMC</span><b>${fmt1(plan.bmi)} · ${plan.bmiLabel}</b>
        ${plan.leanMass ? `<span>Masse maigre</span><b>${fmt1(plan.leanMass)} kg</b><span>Masse grasse</span><b>${fmt1(plan.fatMass)} kg</b>` : ''}
        <span>Eau recommandée</span><b>${fmt1(plan.waterL)} L / jour</b>
      </div>
      <div class="note">Formule : ${plan.formula}${plan.katch ? ` (Mifflin donnerait ${fmt(plan.mifflin)} kcal)` : ''} × ${plan.activity.factor} (${plan.activity.label.toLowerCase()}).</div>
    </div>
  `;
}

function onProfileInput(e) {
  const key = e.target.dataset.profile;
  if (!key) return;
  const v = key === 'activity' ? e.target.value : num(e.target.value);
  state.profile[key] = v;
  save();
  renderPlanResults();
}

/* ---------- Export / import ---------- */
function exportData() {
  const copy = structuredClone(state);
  copy.settings.keys = { gemini: '', claude: '' }; // on n'exporte jamais les clés API
  const blob = new Blob([JSON.stringify(copy)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `nutritrack-sauvegarde-${todayIso()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importData(ev) {
  const file = ev.target.files?.[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data.days || !data.profile) throw new Error();
    const keys = state.settings.keys;
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
    state = load();
    state.settings.keys = keys;
    save();
    toast('Sauvegarde importée ✅');
    render();
  } catch {
    toast('Fichier de sauvegarde invalide.');
  }
}

/* =========================================================
   Gestion des actions (délégation d'événements)
   ========================================================= */
const actions = {
  'day-prev': () => { ui.date = addDays(ui.date, -1); render(); },
  'day-next': () => { ui.date = addDays(ui.date, 1); render(); },
  'day-today': () => { ui.date = todayIso(); render(); },
  'goto-profile': () => showTab('profile'),
  'goto-ai-settings': () => { closeSheet(); showTab('profile'); setTimeout(() => $('#ai-settings')?.scrollIntoView({ behavior: 'smooth' }), 50); },
  add: (el) => openAdd(el.dataset.meal),
  'add-tab': (el) => { ui.addTab = el.dataset.tab; renderAddSheet(); },
  'pick-food': (el) => pickFood(Number(el.dataset.i)),
  'pick-recent': (el) => { const r = state.recents[Number(el.dataset.i)]; if (r) addEntries([{ ...r }]); },
  'add-food': (el) => addEntries([foodValues(FOODS[Number(el.dataset.i)], num($('#food-g').value) || 0)]),
  'save-manual': () => { const it = readManual(); if (it) addEntries([it]); },
  'photo-reset': () => { photoState = null; renderAddContent(); },
  'photo-analyze': () => runAnalysis(),
  'photo-add': () => addPhotoEntries(),
  edit: (el) => openEdit(el.dataset.id),
  'save-edit': (el) => {
    const it = readManual();
    if (!it) return;
    const e = dayData(ui.date).entries.find((x) => x.id === el.dataset.id);
    Object.assign(e, it, { meal: $('#m-meal').value });
    save(); closeSheet(); render(); toast('Modifié ✅');
  },
  'delete-entry': (el) => {
    const d = dayData(ui.date);
    d.entries = d.entries.filter((x) => x.id !== el.dataset.id);
    save(); closeSheet(); render(); toast('Supprimé');
  },
  water: (el) => {
    const d = dayData(ui.date, true);
    const n = Number(el.dataset.n);
    d.water = d.water === n ? n - 1 : n;
    save(); render();
  },
  'cal-prev': () => { const d = parseIso(ui.calMonth + '-01'); d.setMonth(d.getMonth() - 1); ui.calMonth = iso(d).slice(0, 7); render(); },
  'cal-next': () => { const d = parseIso(ui.calMonth + '-01'); d.setMonth(d.getMonth() + 1); ui.calMonth = iso(d).slice(0, 7); render(); },
  'cal-open': (el) => { ui.date = el.dataset.date; showTab('today'); },
  'save-weight': () => {
    const w = num($('#w-val').value);
    const date = $('#w-date').value || todayIso();
    if (!w || w < 25 || w > 350) { toast('Poids invalide.'); return; }
    const bf = num($('#w-bf').value);
    const d = dayData(date, true);
    d.weight = w;
    d.bodyFat = bf && bf > 2 && bf < 70 ? bf : null;
    const last = latestWeight();
    if (last && last.date === date) {
      state.profile.weightKg = w;
      if (d.bodyFat) state.profile.bodyFat = d.bodyFat;
      if (date === todayIso() && d.entries.length) snapshotTarget(date);
    }
    save(); render(); toast('Pesée enregistrée ✅ Quota mis à jour');
  },
  'delete-weight': (el) => {
    const d = state.days[el.dataset.date];
    if (d) { delete d.weight; delete d.bodyFat; }
    save(); render();
  },
  'set-sex': (el) => { state.profile.sex = el.dataset.v; save(); render(); },
  'set-intensity': (el) => { state.profile.intensity = el.dataset.v; save(); render(); },
  'set-goal': (el) => {
    state.profile.goal = el.dataset.v;
    if (state.days[todayIso()]?.entries.length) snapshotTarget(todayIso());
    save(); renderPlanResults(); toast(`Objectif : ${GOALS[el.dataset.v].label}`);
  },
  navy: () => {
    const bf = navyBodyFat({ sex: state.profile.sex, heightCm: state.profile.heightCm, waistCm: num($('#navy-waist').value), neckCm: num($('#navy-neck').value), hipCm: num($('#navy-hip')?.value) });
    if (!bf || bf < 3 || bf > 65) { toast('Vérifie ta taille et tes mensurations.'); return; }
    state.profile.bodyFat = bf;
    $('#bf-input').value = bf;
    save(); renderPlanResults(); toast(`Masse grasse estimée : ${fmt1(bf)} %`);
  },
  'set-provider': (el) => { state.settings.provider = el.dataset.v; save(); renderProfile(); },
  'save-ai': () => {
    const s = state.settings;
    s.keys[s.provider] = $('#api-key').value.trim();
    s.models[s.provider] = $('#api-model').value.trim() || PROVIDERS[s.provider].defaultModel;
    save(); toast('Réglages IA enregistrés ✅');
  },
  export: exportData,
  reset: () => {
    if (!confirm('Effacer toutes tes données (profil, repas, pesées) ? Cette action est définitive.')) return;
    localStorage.removeItem(STORE_KEY);
    state = load();
    render(); toast('Données effacées');
  },
  install: async () => { if (deferredInstall) { deferredInstall.prompt(); deferredInstall = null; render(); } },
  'open-activity': () => openActivity(),
  'paste-activity': () => pasteActivity(),
  'run-shortcut': () => { ui.awaitingHealth = true; window.location.href = `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}`; },
  'save-activity': () => {
    const raw = $('#act-val').value.trim();
    const v = raw === '' ? null : parseHealthText(raw);
    if (raw !== '' && v == null) { toast('Valeur invalide.'); return; }
    setActive(ui.date, v); closeSheet(); toast(v == null ? 'Dépense effacée' : `🔥 ${fmt(v)} kcal actives enregistrées`);
  },
  'clear-activity': () => { setActive(ui.date, null); closeSheet(); toast('Dépense effacée'); },
  'toggle-active': (el) => { state.settings.useActive = el.checked; save(); toast(el.checked ? 'Objectif dynamique activé' : 'Objectif dynamique désactivé'); },
  'test-notif': async () => {
    const perm = await requestPermission();
    if (perm !== 'granted') { toast(perm === 'unsupported' ? 'Notifications indisponibles ici.' : 'Notifications refusées.'); return; }
    notify('💧 Test NutriTrack', 'Les notifications fonctionnent !', 'test');
  },
  'export-ics': () => exportIcs(),
  'hide-install': () => { state.ui.installTipHidden = true; save(); render(); },
};

document.addEventListener('click', (e) => {
  const tab = e.target.closest('.tab');
  if (tab) return showTab(tab.dataset.tab);
  const el = e.target.closest('[data-action]');
  if (el && actions[el.dataset.action]) actions[el.dataset.action](el, e);
});
document.addEventListener('input', (e) => {
  if (e.target.dataset.profile) onProfileInput(e);
  if (e.target.dataset.ai) refreshAiTotal();
  if (e.target.matches('[data-add-meal]')) ui.addMeal = e.target.value;
});
document.addEventListener('change', (e) => {
  if (e.target.dataset.rem) onReminderInput(e.target);
});
document.addEventListener('change', (e) => {
  if (e.target.dataset.profile === 'activity') onProfileInput(e);
});
$('#sheet-backdrop').addEventListener('click', closeSheet);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet(); });

// Changement de jour à minuit / retour dans l'app : on se recale sur aujourd'hui.
let lastToday = todayIso();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const t = todayIso();
  if (t !== lastToday) { if (ui.date === lastToday) ui.date = t; lastToday = t; render(); }
  checkReminders();
  // Retour après le raccourci Santé : on propose directement de coller la valeur.
  if (ui.awaitingHealth) { ui.awaitingHealth = false; ui.date = t; if (ui.tab !== 'today') showTab('today'); openActivity(); }
});



/* ---------- Installation (PWA) ---------- */
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; if (ui.tab === 'today') render(); });

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// Import via lien : …/index.html?active=520 (pratique depuis un raccourci ou sur Android).
(function importFromUrl() {
  const params = new URLSearchParams(location.search);
  if (!params.has('active')) return;
  const v = parseHealthText(params.get('active'));
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') || '') ? params.get('date') : todayIso();
  if (v != null) { setActive(date, v); setTimeout(() => toast(`🔥 ${fmt(v)} kcal actives importées`), 300); }
  history.replaceState(null, '', location.pathname);
})();

setInterval(checkReminders, 60 * 1000);
checkReminders();

render();
