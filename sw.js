// Scrapline Command: offline support. Keeps a copy of the game on the device
// so it opens without an internet connection. Online, it always fetches the
// newest version (and refreshes the copy); offline, it uses the copy.
const CACHE = 'scrapline-v4';
const FILES = [
  './', './index.html', './manifest.webmanifest', './icon.svg', './icon-180.png', './icon-192.png', './icon-512.png',
  './js/config.js', './js/map.js', './js/sim.js', './js/ai.js', './js/campaign.js', './js/sprites.js', './js/sprites_kethra.js', './js/sprites_factions.js',
  './js/render.js', './js/saves.js', './js/music.js', './js/main.js', './js/war.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Newest version first (giving up after 4 seconds on a weak signal), the
// saved copy when there's no connection.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await Promise.race([fetch(req), new Promise((_, no) => setTimeout(() => no(new Error('slow')), 4000))]);
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      return (await cache.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? cache.match('./index.html') : Response.error());
    }
  })());
});
