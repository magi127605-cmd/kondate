/* オフライン対応。VERSION を上げると次回起動時に新しいファイルに入れ替わる */
const VERSION = 'km-v1.0.1';
const FILES = [
  './', './index.html', './plan.css?v=1.0.1', './app.css?v=1.0.1', './manifest.webmanifest',
  './js/config.js?v=1.0.1', './js/app.js?v=1.0.1', './js/timer.js?v=1.0.1', './js/portion.js?v=1.0.1',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/maskable-512.png',
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
