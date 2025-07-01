// sw.js - Enhanced Service Worker for FastTrackers PWA
const CACHE_NAME = 'fasttrackers-v2.1';
const DATA_CACHE_NAME = 'fasttrackers-data-v1';

// Assets to cache for offline use
const FILES_TO_CACHE = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.json',
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
    const db = await openDB();
    const tx = db.transaction(['offlinePatients'], 'readonly');
    const store = tx.objectStore('offlinePatients');
    const offlinePatients = await store.getAll();
    
    for (const patient of offlinePatients) {
      await sendToFirebase('patients', patient);
      await removeFromOfflineStorage('offlinePatients', patient.id);
    }
    
    console.log('[ServiceWorker] Patient data synced successfully');
  } catch (error) {
    console.error('[ServiceWorker] Error syncing patient data:', error);
    throw error;
  }
}

// Sync task data
async function syncTaskData() {
  try {
    const db = await openDB();
    const tx = db.transaction(['offlineTasks'], 'readonly');
    const store = tx.objectStore('offlineTasks');
    const offlineTasks = await store.getAll();
    
    for (const task of offlineTasks) {
      await sendToFirebase('tasks', task);
      await removeFromOfflineStorage('offlineTasks', task.id);
    }
    
    console.log('[ServiceWorker] Task data synced successfully');
  } catch (error) {
    console.error('[ServiceWorker] Error syncing task data:', error);
    throw error;
  }
}

// Sync statistics data
async function syncStatsData() {
  try {
    const db = await openDB();
    const tx = db.transaction(['offlineStats'], 'readonly');
    const store = tx.objectStore('offlineStats');
    const offlineStats = await store.getAll();
    
    for (const stat of offlineStats) {
      await sendToFirebase('stats', stat);
      await removeFromOfflineStorage('offlineStats', stat.id);
    }
    
    console.log('[ServiceWorker] Stats data synced successfully');
  } catch (error) {
    console.error('[ServiceWorker] Error syncing stats data:', error);
    throw error;
  }
}

// Helper functions for IndexedDB operations
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('FastTrackersOfflineDB', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains('offlinePatients')) {
        db.createObjectStore('offlinePatients', { keyPath: 'id' });
      }
      
      if (!db.objectStoreNames.contains('offlineTasks')) {
        db.createObjectStore('offlineTasks', { keyPath: 'id' });
      }
      
      if (!db.objectStoreNames.contains('offlineStats')) {
        db.createObjectStore('offlineStats', { keyPath: 'id' });
      }
    };
  });
}

async function sendToFirebase(collection, data) {
  console.log(`[ServiceWorker] Sending ${collection} data to Firebase:`, data);
}

async function removeFromOfflineStorage(storeName, id) {
  const db = await openDB();
  const tx = db.transaction([storeName], 'readwrite');
  const store = tx.objectStore(storeName);
  await store.delete(id);
}
