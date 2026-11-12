/* Service worker: caches the app shell + the full question-bank data (JSON +
 * every explanation image) so the quiz works offline after first load.
 * Bump CACHE_VERSION whenever any shipped file changes so clients pick up
 * the new version instead of serving stale cached assets forever. */
var CACHE_VERSION = 'b787quiz-v1';

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
    }).then(function () {
      return self.skipWaiting();
    })
  );
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
