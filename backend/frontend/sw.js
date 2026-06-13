 const CACHE_NAME = 'novel-reader-v1';
 const ASSETS = [
   '/',
   '/index.html',
   '/search.html',
   '/reader.html',
   '/manifest.json',
   '/css/theme.css',
   '/css/style.css',
   '/css/bookshelf.css',
   '/css/search.css',
   '/css/reader.css',
   '/js/utils.js',
   '/js/db.js',
   '/js/api.js',
   '/js/cache.js',
   '/js/bookshelf.js',
   '/js/search.js',
   '/js/app.js'
 ];
 
 self.addEventListener('install', (e) => {
   e.waitUntil(
     caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
   );
 });
 
 self.addEventListener('fetch', (e) => {
   // API 请求不缓存
   if (e.request.url.includes('/api/')) return;
 
   e.respondWith(
     caches.match(e.request).then(cached => cached || fetch(e.request))
   );
 });
 
 self.addEventListener('activate', (e) => {
   e.waitUntil(
     caches.keys().then(keys => Promise.all(
       keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
     ))
   );
 });
