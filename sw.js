const CACHE_NAME = 'ironlog-v12';
const ASSETS = [
  './',
  './workout-app.html',
  './manifest.json'
];

// Install: cache the app shell
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Let the page ask the worker to step aside or identify itself
self.addEventListener('message', (e) => {
  if (!e.data) return;
  if (e.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (e.data.type === 'VERSION' && e.source) {
    e.source.postMessage({ type: 'VERSION', cache: CACHE_NAME });
  }
});

// Fetch: cache-first for our own assets only.
//
// Deliberately conservative. An earlier version fell back to
// `caches.match('./workout-app.html')` on error, which resolves to undefined
// on a miss — and respondWith(undefined) surfaces in the page as a bare
// "Failed to fetch". For a cross-origin API call that's indistinguishable
// from the network being down, so this now refuses to touch anything that
// isn't a same-origin GET.
self.addEventListener('fetch', (e) => {
  const req = e.request;

  // Only ever handle same-origin GETs. Everything else — API calls,
  // POSTs, preflights, third-party requests — goes straight to the network
  // untouched.
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(response => {
        if (response && response.ok && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone)).catch(() => {});
        }
        return response;
      });
    }).catch(() => {
      // Never resolve to undefined — that becomes a network error in the page.
      return caches.match('./workout-app.html').then(fallback =>
        fallback || new Response('Offline and not cached.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain' }
        })
      );
    })
  );
});
