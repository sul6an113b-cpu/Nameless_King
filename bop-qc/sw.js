// Offline cache for the app shell. VERSION is stamped by tools/release.py from
// APP_VERSION and a hash of every cached file, so any change reaches installed
// phones (the app shows "Update ready"). tests/release-check.mjs guards it.
const VERSION = 'bopqc-v1.2.0-c8c812821d';
const ASSETS = [
  './',
  './index.html',
  './app.css',
  './manifest.webmanifest',
  './js/app.js',
  './js/store.js',
  './js/db.js',
  './js/util.js',
  './js/zip.js',
  './js/photo.js',
  './js/export.js',
  './js/checklists.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('bopqc-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // Any page load inside the app scope gets the cached shell (works with no signal).
    e.respondWith(
      caches.match(new URL('./index.html', self.registration.scope).href).then((r) => r || fetch(req)),
    );
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req)));
});
