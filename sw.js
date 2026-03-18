const CACHE_NAME = 'mum180-v1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './portal.html',
  './access.html',
  './overview.html',
  './manifest.json',
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Network first — always get fresh content
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
