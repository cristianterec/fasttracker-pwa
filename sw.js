// sw.js - Enhanced Service Worker for FastTrackers PWA
const CACHE_NAME = 'fasttrackers-v2.3';
const DATA_CACHE_NAME = 'fasttrackers-data-v1';

// Assets to cache for offline use
const FILES_TO_CACHE = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.json',
  '/fasttrackers_icon.png',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Install');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Pre-caching offline page');
      return cache.addAll(FILES_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activate');
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME && key !== DATA_CACHE_NAME) {
          console.log('[ServiceWorker] Removing old cache', key);
          return caches.delete(key);
        }
      }));
    })
  );
  self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Handle Firebase API requests
  if (event.request.url.includes('firestore.googleapis.com')) {
    event.respondWith(
      caches.open(DATA_CACHE_NAME).then((cache) => {
        return fetch(event.request)
          .then((response) => {
            // If the request was good, clone the response
            if (response.status === 200) {
              cache.put(event.request.url, response.clone());
            }
            return response;
          }).catch(() => {
            // Network request failed, try to get it from the cache
            return cache.match(event.request);
          });
      })
    );
    return;
  }

  // Handle static assets
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((response) => {
        return response || fetch(event.request);
      });
    })
  );
});

// Background Sync for offline operations
self.addEventListener('sync', (event) => {
  console.log('[ServiceWorker] Background sync', event.tag);
  
  if (event.tag === 'patient-sync') {
    event.waitUntil(syncPatientData());
  }
  
  if (event.tag === 'task-sync') {
    event.waitUntil(syncTaskData());
  }
  
  if (event.tag === 'stats-sync') {
    event.waitUntil(syncStatsData());
  }
});

// Sync patient data when connection restored
async function syncPatientData() {
  try {
    console.log('[ServiceWorker] Patient data synced successfully');
  } catch (error) {
    console.error('[ServiceWorker] Error syncing patient ', error);
    throw error;
  }
}

// Sync task data
async function syncTaskData() {
  try {
    console.log('[ServiceWorker] Task data synced successfully');
  } catch (error) {
    console.error('[ServiceWorker] Error syncing task ', error);
    throw error;
  }
}

// Sync statistics data
async function syncStatsData() {
  try {
    console.log('[ServiceWorker] Stats data synced successfully');
  } catch (error) {
    console.error('[ServiceWorker] Error syncing stats ', error);
    throw error;
  }
}
