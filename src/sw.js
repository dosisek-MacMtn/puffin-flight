/* Puffin Flight service worker.
 *
 * The whole game is one HTML file, so "offline support" is mostly just holding
 * on to that file. Everything is same-origin and precached at install; the
 * cache name carries a build hash, so a new build lands in a fresh cache and
 * the old one is dropped on activate.
 *
 * __CACHE_VERSION__ is substituted by build.js.
 */
'use strict';

var VERSION = '__CACHE_VERSION__';
var CACHE = 'puffin-flight-' + VERSION;
var PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon-180.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function (cache) { return cache.addAll(PRECACHE); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (key) {
          return key === CACHE ? null : caches.delete(key);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // Only the app's own entry URL is served from cache, so the game launches
    // instantly and works with no network. Any other page inside the scope is
    // left to the network (with the shell as an offline fallback) - a blanket
    // cache-first here would hijack sibling pages deployed alongside the game.
    var scope = new URL('./', self.location).pathname;
    var reqPath = new URL(req.url).pathname;
    if (reqPath === scope || reqPath === scope + 'index.html') {
      event.respondWith(
        caches.match('./index.html').then(function (hit) { return hit || fetch(req); })
      );
    } else {
      event.respondWith(
        fetch(req).catch(function () { return caches.match('./index.html'); })
      );
    }
    return;
  }

  event.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (cache) { cache.put(req, copy); });
        }
        return res;
      });
    })
  );
});
