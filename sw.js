// Service worker disabled — clear all caches
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => {
        self.clients.matchAll().then(clients => {
          clients.forEach(client => client.navigate(client.url));
        });
      })
  );
});
self.addEventListener('fetch', e => e.respondWith(fetch(e.request)));
