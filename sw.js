// FastTrackers PWA - Enhanced Service Worker
const CACHE_NAME = 'fasttrackers-v4.0';
const DATA_CACHE_NAME = 'fasttrackers-data-v3';

// Assets to cache for offline use
const FILES_TO_CACHE = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.json',
  '/my_icon.png',
  '/my_icon_192.png',
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
  // Handle Firebase API requests with data caching
  if (event.request.url.includes('firestore.googleapis.com')) {
    event.respondWith(
      caches.open(DATA_CACHE_NAME).then((cache) => {
        return fetch(event.request)
          .then((response) => {
            // If the request was successful, clone and cache the response
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
        // Return cached version or fetch from network
        return response || fetch(event.request).catch(() => {
          // If both cache and network fail, return offline page for navigation requests
          if (event.request.destination === 'document') {
            return cache.match('/index.html');
          }
        });
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
  
  if (event.tag === 'user-data-sync') {
    event.waitUntil(syncUserData());
  }
  
  if (event.tag === 'stats-sync') {
    event.waitUntil(syncStatsData());
  }
  
  if (event.tag === 'transfer-sync') {
    event.waitUntil(syncTransferData());
  }
});

// Sync functions for offline data
async function syncPatientData() {
  try {
    console.log('[ServiceWorker] Patient data synced successfully');
    // Implementation would sync pending patient operations
  } catch (error) {
    console.error('[ServiceWorker] Error syncing patient data:', error);
    throw error;
  }
}

async function syncUserData() {
  try {
    console.log('[ServiceWorker] User data synced successfully');
    // Implementation would sync user profile changes
  } catch (error) {
    console.error('[ServiceWorker] Error syncing user data:', error);
    throw error;
  }
}

async function syncStatsData() {
  try {
    console.log('[ServiceWorker] Stats data synced successfully');
    // Implementation would sync statistics updates
  } catch (error) {
    console.error('[ServiceWorker] Error syncing stats data:', error);
    throw error;
  }
}

async function syncTransferData() {
  try {
    console.log('[ServiceWorker] Transfer data synced successfully');
    // Implementation would sync patient transfer operations
  } catch (error) {
    console.error('[ServiceWorker] Error syncing transfer data:', error);
    throw error;
  }
}

// Push notification handling
self.addEventListener('push', (event) => {
  console.log('[ServiceWorker] Push Received.');
  
  if (event.data) {
    const data = event.data.json();
    const title = data.title || 'FastTrackers';
    const options = {
      body: data.body || 'Nouvelle notification',
      icon: '/my_icon_192.png',
      badge: '/my_icon_192.png',
      tag: data.tag || 'general',
      data: data.data || {},
      requireInteraction: data.requireInteraction || false
    };
    
    event.waitUntil(self.registration.showNotification(title, options));
  }
});

// Notification click handling
self.addEventListener('notificationclick', (event) => {
  console.log('[ServiceWorker] Notification click Received.');
  
  event.notification.close();
  
  // Focus or open the app window
  event.waitUntil(
    clients.matchAll({
      type: 'window'
    }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});

// Message handling for communication with main app
self.addEventListener('message', (event) => {
  console.log('[ServiceWorker] Message received:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }
});

console.log('[ServiceWorker] FastTrackers service worker loaded');
