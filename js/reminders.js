// Rappels pour boire de l'eau et noter ses repas.
// Deux mécanismes :
//  1. Notifications de l'app : envoyées tant que l'app tourne (ouverte ou juste en arrière-plan).
//     Une web app ne peut pas se réveiller seule quand elle est fermée sans serveur de push.
//  2. Export Calendrier (.ics) : des événements quotidiens avec alerte, gérés par le téléphone
//     lui-même → notifications fiables même app fermée, sans serveur.

export const DEFAULT_REMINDERS = {
  enabled: false,
  water: { on: true, start: '09:00', end: '21:00', everyMin: 120 },
  meals: {
    breakfast: { on: true, time: '08:00' },
    lunch: { on: true, time: '12:30' },
    snack: { on: false, time: '16:30' },
    dinner: { on: true, time: '19:30' },
  },
};

const toMin = (hhmm) => { const [h, m] = String(hhmm || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
const pad = (n) => String(n).padStart(2, '0');

export function notificationsSupported() {
  return 'Notification' in window && 'serviceWorker' in navigator;
}

export async function requestPermission() {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  return Notification.requestPermission();
}

export async function notify(title, body, tag) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return false;
  const opts = { body, tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', renotify: true };
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, opts);
  } catch {
    new Notification(title, opts);
  }
  return true;
}

// Liste des heures de rappel d'eau entre début et fin.
export function waterTimes(water) {
  const out = [];
  const start = toMin(water.start);
  const end = toMin(water.end);
  const step = Math.max(30, Number(water.everyMin) || 120);
  for (let t = start; t <= end; t += step) out.push(t);
  return out;
}

/**
 * Vérifie s'il faut envoyer un rappel maintenant.
 * `ctx` = { now: Date, meals: [{id,label,emoji}], loggedMeals: Set, waterCount, waterGoal, sent: Set }
 * Renvoie la liste des rappels à envoyer ({ key, title, body }).
 */
export function dueReminders(cfg, ctx) {
  if (!cfg.enabled) return [];
  const nowMin = ctx.now.getHours() * 60 + ctx.now.getMinutes();
  const due = [];
  // Un rappel est « dû » pendant 45 min après son heure, s'il n'a pas déjà été envoyé.
  const inWindow = (t) => nowMin >= t && nowMin - t < 45;

  for (const m of ctx.meals) {
    const r = cfg.meals[m.id];
    if (!r?.on) continue;
    const key = `meal-${m.id}`;
    if (inWindow(toMin(r.time)) && !ctx.sent.has(key) && !ctx.loggedMeals.has(m.id)) {
      due.push({ key, title: `${m.emoji} ${m.label}`, body: 'C\'est l\'heure de manger ! Pense à noter ton repas dans NutriTrack.' });
    }
  }

  if (cfg.water.on && ctx.waterCount < ctx.waterGoal) {
    for (const t of waterTimes(cfg.water)) {
      const key = `water-${t}`;
      if (inWindow(t) && !ctx.sent.has(key)) {
        const left = ((ctx.waterGoal - ctx.waterCount) * 0.25).toFixed(2).replace(/\.?0+$/, '').replace('.', ',');
        due.push({ key, title: '💧 Bois un verre d\'eau', body: `Encore ${left} L pour atteindre ton objectif du jour.` });
        break;
      }
    }
  }
  return due;
}

/* ---------- Export Calendrier (.ics) ---------- */
function icsDate(d, min) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(Math.floor(min / 60))}${pad(min % 60)}00`;
}

export function buildIcs(cfg, meals) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const events = [];
  const add = (id, min, summary, desc) => {
    events.push([
      'BEGIN:VEVENT',
      `UID:nutritrack-${id}@nutritrack`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsDate(start, min)}`,
      'DURATION:PT5M',
      'RRULE:FREQ=DAILY',
      `SUMMARY:${summary}`,
      `DESCRIPTION:${desc}`,
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${summary}`,
      'TRIGGER:PT0M',
      'END:VALARM',
      'END:VEVENT',
    ].join('\r\n'));
  };
  for (const m of meals) {
    const r = cfg.meals[m.id];
    if (r?.on) add(`meal-${m.id}`, toMin(r.time), `${m.emoji} ${m.label}`, 'Pense à noter ton repas dans NutriTrack.');
  }
  if (cfg.water.on) {
    for (const t of waterTimes(cfg.water)) add(`water-${t}`, t, '💧 Bois un verre d\'eau', 'Rappel hydratation NutriTrack.');
  }
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//NutriTrack//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:NutriTrack', ...events, 'END:VCALENDAR'].join('\r\n');
}
