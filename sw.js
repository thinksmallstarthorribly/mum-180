const CACHE_NAME = 'life-circuitry-v2';
const ASSETS = [
  './index.html',
  './portal.html',
  './access.html',
  './module-1.html',
  './module-2.html',
  './module-3.html',
  './module-4.html',
  './module-5.html',
  './module-6.html',
  './module-7.html',
  './manifest.json',
  './sw.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
