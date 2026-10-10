/* SUBLYNQ service worker — makes the app installable and gives it an offline shell.
   Live data (Cloudflare worker, Google Apps Script, CDNs) is NEVER cached here. */
const VERSION = 'sublynq-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-192.png',
  './icons/maskable-512.png', './icons/apple-touch-icon.png', './icons/icon.svg'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSION)
      // allSettled: one missing file must not abort the whole install
      .then(cache => Promise.allSettled(SHELL.map(u => cache.add(new Request(u, { cache: 'reload' })))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('sublynq-') && k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;           // live APIs / CDNs: straight to network

  // Page loads: network-first (always the newest app), cached copy only when offline
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put('./index.html', copy)).catch(() => {});
        return res;
      }).catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  // Icons / manifest / other same-origin files: serve cached, refresh in background
  event.respondWith(
    caches.match(req).then(cached => {
      const net = fetch(req).then(res => {
        if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)).catch(() => {}); }
        return res;
      }).catch(() => cached);
      return cached || net;
    })
  );
});
