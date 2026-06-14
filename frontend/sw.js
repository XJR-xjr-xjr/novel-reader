var CACHE_NAME = 'novel-reader-v2';
var ASSETS = [
  '/', '/index.html', '/search.html', '/reader.html', '/manifest.json',
  '/css/theme.css', '/css/style.css', '/css/bookshelf.css', '/css/search.css', '/css/reader.css',
  '/js/utils.js', '/js/db.js', '/js/api.js', '/js/cache.js', '/js/bookshelf.js',
  '/js/search.js', '/js/tts.js', '/js/reader.js', '/js/app.js'
];

self.addEventListener('install', function(e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then(function(cache) { return cache.addAll(ASSETS); }));
});

self.addEventListener('activate', function(e) {
  clients.claim();
  e.waitUntil(caches.keys().then(function(keys) {
    return Promise.all(keys.filter(function(k) { return k !== CACHE_NAME; }).map(function(k) { return caches.delete(k); }));
  }));
});

self.addEventListener('fetch', function(e) {
  if (e.request.url.includes('/api/')) return;
  // Network-first for HTML, cache-first for others
  var isHTML = e.request.destination === 'document' || e.request.url.endsWith('.html') || e.request.url.endsWith('/');
  if (isHTML) {
    e.respondWith(
      fetch(e.request).then(function(r) {
        var rc = r.clone();
        caches.open(CACHE_NAME).then(function(c) { c.put(e.request, rc); });
        return r;
      }).catch(function() { return caches.match(e.request); })
    );
  } else {
    e.respondWith(
      caches.match(e.request).then(function(cached) { return cached || fetch(e.request); })
    );
  }
});