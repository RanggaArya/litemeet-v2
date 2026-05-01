const CACHE_NAME = 'litemeet-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Simple network-first approach to satisfy PWA requirements
  event.respondWith(
    fetch(event.request).catch(() => {
      return new Response('Anda sedang offline.', { status: 503 });
    })
  );
});
