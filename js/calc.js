// Calculs nutritionnels : métabolisme de base, dépense totale, objectifs et macros.

export const ACTIVITY_LEVELS = [
  { id: 'sedentary', label: 'Sédentaire', hint: 'Bureau, peu ou pas de sport', factor: 1.2 },
  { id: 'light', label: 'Légèrement actif', hint: 'Sport 1–3 fois / semaine', factor: 1.375 },
  { id: 'moderate', label: 'Modérément actif', hint: 'Sport 3–5 fois / semaine', factor: 1.55 },
  { id: 'active', label: 'Très actif', hint: 'Sport intense 6–7 fois / semaine', factor: 1.725 },
  { id: 'athlete', label: 'Extrêmement actif', hint: 'Travail physique + entraînement quotidien', factor: 1.9 },
];

// Ajustement calorique selon l'objectif et l'intensité choisie.
export const GOALS = {
  cut: { label: 'Sèche', emoji: '🔥', adj: { light: -0.10, moderate: -0.20, aggressive: -0.25 }, proteinPerKg: 2.2 },
  maintain: { label: 'Maintien', emoji: '⚖️', adj: { light: 0, moderate: 0, aggressive: 0 }, proteinPerKg: 1.8 },
  bulk: { label: 'Prise de masse', emoji: '💪', adj: { light: 0.05, moderate: 0.10, aggressive: 0.15 }, proteinPerKg: 2.0 },
};

export const INTENSITIES = [
  { id: 'light', label: 'Douce' },
  { id: 'moderate', label: 'Modérée' },
  { id: 'aggressive', label: 'Rapide' },
];

const KCAL_PER_KG_FAT = 7700;

export function isProfileComplete(p) {
  return p && p.sex && p.age > 0 && p.heightCm > 0 && p.weightKg > 0 && p.activity;
}

// Mifflin-St Jeor (sans composition corporelle) ou Katch-McArdle (avec % de masse grasse).
export function computeBmr(p) {
  const mifflin = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + (p.sex === 'male' ? 5 : -161);
  const hasBf = p.bodyFat > 2 && p.bodyFat < 70;
  if (!hasBf) return { bmr: mifflin, formula: 'Mifflin-St Jeor', mifflin, katch: null };
  const lbm = p.weightKg * (1 - p.bodyFat / 100);
  const katch = 370 + 21.6 * lbm;
  return { bmr: katch, formula: 'Katch-McArdle (masse maigre)', mifflin, katch };
}

export function macrosFor(kcal, p, goalId) {
  const goal = GOALS[goalId];
  const hasBf = p.bodyFat > 2 && p.bodyFat < 70;
  // Avec la composition corporelle, on base les protéines sur la masse maigre (plus précis).
  const proteinG = hasBf
    ? p.weightKg * (1 - p.bodyFat / 100) * (goal.proteinPerKg + 0.4)
    : p.weightKg * goal.proteinPerKg;
  const fatG = Math.max((kcal * 0.25) / 9, p.weightKg * 0.8);
  const carbsG = Math.max((kcal - proteinG * 4 - fatG * 9) / 4, 0);
  return { protein: Math.round(proteinG), fat: Math.round(fatG), carbs: Math.round(carbsG) };
}

export function computePlan(p) {
  const { bmr, formula, mifflin, katch } = computeBmr(p);
  const act = ACTIVITY_LEVELS.find((a) => a.id === p.activity) || ACTIVITY_LEVELS[0];
  const tdee = bmr * act.factor;
  const intensity = p.intensity || 'moderate';

  const goals = {};
  for (const [id, g] of Object.entries(GOALS)) {
    const adj = g.adj[intensity];
    const kcal = Math.round((tdee * (1 + adj)) / 10) * 10;
    const dailyDelta = kcal - tdee;
    goals[id] = {
      id,
      ...g,
      adj,
      kcal,
      deltaPct: Math.round(adj * 100),
      weeklyKg: (dailyDelta * 7) / KCAL_PER_KG_FAT,
      macros: macrosFor(kcal, p, id),
      belowBmr: kcal < bmr,
    };
  }

  const bmi = p.weightKg / (p.heightCm / 100) ** 2;
  const hasBf = p.bodyFat > 2 && p.bodyFat < 70;
  return {
    bmr: Math.round(bmr),
    mifflin: Math.round(mifflin),
    katch: katch ? Math.round(katch) : null,
    formula,
    tdee: Math.round(tdee),
    activity: act,
    goals,
    target: goals[p.goal || 'maintain'],
    bmi: Math.round(bmi * 10) / 10,
    bmiLabel: bmi < 18.5 ? 'Insuffisance pondérale' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Surpoids' : 'Obésité',
    leanMass: hasBf ? Math.round(p.weightKg * (1 - p.bodyFat / 100) * 10) / 10 : null,
    fatMass: hasBf ? Math.round(p.weightKg * (p.bodyFat / 100) * 10) / 10 : null,
    waterL: Math.round(p.weightKg * 0.035 * 10) / 10,
  };
}

// Estimation du % de masse grasse par la méthode US Navy (mètre ruban).
export function navyBodyFat({ sex, heightCm, waistCm, neckCm, hipCm }) {
  if (!heightCm || !waistCm || !neckCm) return null;
  const log = Math.log10;
  let bf;
  if (sex === 'male') {
    if (waistCm <= neckCm) return null;
    bf = 495 / (1.0324 - 0.19077 * log(waistCm - neckCm) + 0.15456 * log(heightCm)) - 450;
  } else {
    if (!hipCm || waistCm + hipCm <= neckCm) return null;
    bf = 495 / (1.29579 - 0.35004 * log(waistCm + hipCm - neckCm) + 0.221 * log(heightCm)) - 450;
  }
  return Math.round(bf * 10) / 10;
}
