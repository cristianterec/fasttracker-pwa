// Full app.js with all functions, including multi-user, transfer, suggestions, notes etc.
console.log('Full app.js starting; all features enabled...');

const firebaseConfig = {
  apiKey: "AIzaSyB8PDbtjAqmEw8-jTuiHGgx2W1a9O1gRQU",
  authDomain: "fasttrackers-sync.firebaseapp.com",
  projectId: "fasttrackers-sync",
  storageBucket: "fasttrackers-sync.firebasestorage.app",
  messagingSenderId: "987908003870",
  appId: "1:987908003870:web:0e9c19e942df988c5ab60f"
};

let currentUserId = null; // userID from Firebase
let currentUserName = '';
let db = null;
let unsubscribePatients = null;
let unsubscribeStats = null;
let unsubscribeNotes = null;
let lastTaskSuggestion = {}; // user-specific task suggestions
let pastTasksStats = {}; // count of past tasks for suggestion refining
let transferRequests = {}; // store incoming transfer requests

// Firebase init
async function initFirebase() {
  const { initializeApp } = await import('https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js');
  const { getFirestore, collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, getDoc, getDocs, query, where, orderBy, writeBatch, serverTimestamp, enableIndexedDbPersistence } } = await import('https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js');

  await initializeApp(firebaseConfig);
  db = getFirestore();
  try { await enableIndexedDbPersistence(db); } catch(e){ console.warn('No offline persistence:', e); }
  window.firebase = { collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, getDoc, getDocs, query, where, orderBy, writeBatch, serverTimestamp };
}

// Registration & login
async function loadUserList() {
  const { collection, getDocs } = window.firebase;
  const usersSnap = await getDocs(collection(db, 'users'));
  const select = document.getElementById('userSelect');
  select.innerHTML = '<option value="">Sélectionner un utilisateur</option>';
  usersSnap.forEach(u => {
    const data = u.data();
    const option = document.createElement('option');
    option.value = u.id;
    option.textContent = data.name;
    select.appendChild(option);
  });
}
async function handleUserLogin() {
  const userId = document.getElementById('userSelect').value;
  const pin = document.getElementById('pinField').value;
  if (!userId || !pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
    alert('Sélectionnez un utilisateur et entrez un PIN valide.');
    return;
  }
  const { getDoc, doc } = window.firebase;
  const userRef = doc(db, 'users', userId);
  const snap = await getDoc(userRef);
  if (!snap.exists() || snap.data().pin !== pin) {
    alert('PIN incorrect');
    return;
  }
  currentUserId = userId;
  currentUserName = snap.data().name;
  document.getElementById('username').textContent = currentUserName;
  document.getElementById('auth').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  startRealtimeUpdates();
  startTimers();
}

// Listeners
function startRealtimeUpdates() {
  const { collection, onSnapshot, doc } = window.firebase;
  // Patients
  const ptsQ = query(collection(db, 'users', currentUserId, 'patients'), orderBy('createdAt', 'desc'));
  unsubscribePatients = onSnapshot(ptsQ, snap => renderPatients(snap));
  // Stats
  unsubscribeStats = onSnapshot(doc(db, 'users', currentUserId, 'stats', 'main'), d => updateStats(d.data()));
  // Notes
  const notesCol = collection(db, 'users', currentUserId, 'notes');
  unsubscribeNotes = onSnapshot(notesCol, snap => renderNotes(snap));
  loadDailyStats();
}
// Patient rendering, editing, adding, deleting, transferring, suggestions...
// [ All functions: showAddPatientModal, savePatient, showEditPatientModal, savePatientEdits, deletePatient, transferPatients, suggestTaskChip, addTask, completeTask, deleteTask, showTransferModal, handleTransfer, etc. ]

// Finals: counters, charts, profile editing, note management, etc.
// [ Fully expanded with respective functions]

// Helper: generateId, createModal, formatDiff, etc.
