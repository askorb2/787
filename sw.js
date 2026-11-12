/* Service worker: caches the app shell + the full question-bank data (JSON +
 * every explanation image) so the quiz works offline after first load.
 * Bump CACHE_VERSION whenever any shipped file changes — a new version
 * installs in the background and waits; app.js surfaces an "업데이트" button
 * once it's ready, and only actually takes over (SKIP_WAITING) when the user
 * taps it, instead of silently swapping files out from under an open tab. */
var CACHE_VERSION = 'b787quiz-v3';

var CORE_ASSETS = [
  './',
  'index.html',
  'app.js',
  'logic.js',
  'style.css',
  'manifest.webmanifest',
  'icon.svg',
  'icon-192.png',
  'icon-512.png',
  'data/questions.json',
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      return cache.addAll(CORE_ASSETS).then(function () {
        return fetch('data/questions.json').then(function (res) {
          return res.json();
        }).then(function (questions) {
          var imgUrls = [];
          questions.forEach(function (q) {
            (q.exp || []).forEach(function (item) {
              if (item.t === 'img') imgUrls.push('data/' + item.v);
            });
          });
          return cache.addAll(imgUrls);
        });
      });
    })
    // deliberately no self.skipWaiting() here: a first-ever install still
    // activates immediately (nothing to wait for), but an update install
    // now correctly parks in the "waiting" state until the page asks for it.
  );
});

self.addEventListener('message', function (event) {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_VERSION; })
            .map(function (k) { return caches.delete(k); })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      if (cached) return cached;
      return fetch(event.request).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE_VERSION).then(function (cache) { cache.put(event.request, copy); });
        return res;
      }).catch(function () {
        if (event.request.mode === 'navigate') return caches.match('index.html');
        return new Response('', { status: 504, statusText: 'offline' });
      });
    })
  );
});
