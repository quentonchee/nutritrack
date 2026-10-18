// Service worker : met l'app en cache pour qu'elle marche hors ligne.
// Incrémente VERSION à chaque mise à jour pour forcer le rafraîchissement.
const VERSION = 'nutritrack-v1';
const SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/foods.js',
  './js/calc.js',
  './js/ai.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // On ne touche pas aux appels d'API (Gemini / Claude) ni aux autres domaines.
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Réseau d'abord (pour avoir les mises à jour), cache en secours hors ligne.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
  );
});
