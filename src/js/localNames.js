// localNames.js - stores last names locally so they never reach Firestore
// Tries IndexedDB first, then falls back to localStorage for older browsers

const DB_NAME = 'fasttrackers-local-names';
const STORE_NAME = 'names';
const FALLBACK_KEY = 'fasttrackers-local-names';
let dbPromise = null;

function openDb() {
  if (!('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  if (dbPromise) {
    return dbPromise;
  }
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => resolve(null);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'patientCode' });
      }
    };
  });
  return dbPromise;
}

function readFallback() {
  try {
    const raw = localStorage.getItem(FALLBACK_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.warn('localStorage unavailable:', error);
    return {};
  }
}

function writeFallback(store) {
  try {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(store));
  } catch (error) {
    console.warn('localStorage write failed:', error);
  }
}

export async function saveLocalName(patientCode, lastName) {
  const trimmed = lastName.trim();
  const db = await openDb();
  if (db) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      const store = tx.objectStore(STORE_NAME);
      store.put({ patientCode, lastName: trimmed });
    });
  }
  const fallback = readFallback();
  fallback[patientCode] = trimmed;
  writeFallback(fallback);
  return Promise.resolve();
}

export async function getLocalName(patientCode) {
  const db = await openDb();
  if (db) {
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      tx.oncomplete = () => {};
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(patientCode);
      request.onsuccess = () => {
        resolve(request.result ? request.result.lastName : undefined);
      };
      request.onerror = () => resolve(undefined);
    });
  }
  const fallback = readFallback();
  return fallback[patientCode];
}

export async function getManyLocalNames(patientCodes) {
  const results = new Map();
  const db = await openDb();
  if (db) {
    await Promise.all(
      patientCodes.map(
        (code) =>
          new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.get(code);
            request.onsuccess = () => {
              if (request.result) {
                results.set(code, request.result.lastName);
              }
              resolve();
            };
            request.onerror = () => resolve();
          })
      )
    );
    return results;
  }
  const fallback = readFallback();
  patientCodes.forEach((code) => {
    if (fallback[code]) {
      results.set(code, fallback[code]);
    }
  });
  return results;
}
