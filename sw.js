// Offline support: serve the cached copy at once (finish lines rarely have signal), refresh it in the
// background when there is a connection. An update therefore shows up on the second load after deploying.
const CACHE = 'trailtime-v1';

self.addEventListener('install', e => e.waitUntil(
  caches.open(CACHE)
    .then(c => c.addAll(['./', 'core.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png']))
    .then(() => self.skipWaiting())
));
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => {
    const net = fetch(e.request).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return r;
    });
    if (!hit) return net;
    net.catch(() => {}); // offline: the cached copy is the answer
    return hit;
  }));
});
