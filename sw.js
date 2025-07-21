// sw.js - Basic cache with updated name
const CACHE_NAME = 'fasttrackers-v4';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.json',
  '/fasttrackers_icon.png',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => k !== CACHE_NAME ? caches.delete(k) : null)))
  );
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  if (e.request.url.includes('firestore.googleapis.com')) {
    e.respondWith(
      caches.open('firestore-cache').then(cache => 
        fetch(e.request).then(r => { if (r.status === 200) cache.put(e.request.url, r.clone()); return r; })
        .catch(() => cache.match(e.request))
      )
    );
    return;
  }
  e.respondWith(
    caches.open(CACHE_NAME).then(c => c.match(e.request).then(r => r || fetch(e.request)))
  );
});
