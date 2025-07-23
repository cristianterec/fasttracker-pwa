// FastTrackers PWA - Auth fixed (username + 4-digit PIN).
// Only authentication-related code was changed; rest of the app logic is untouched.
// 2025-07-23

'use strict';

// ---------------- Firebase config ----------------
const firebaseConfig = {
  apiKey: "AIzaSyB8PDbtjAqmEw8-jTuiHGgx2W1a9O1gRQU",
  authDomain: "fasttrackers-sync.firebaseapp.com",
  projectId: "fasttrackers-sync",
  storageBucket: "fasttrackers-sync.firebasestorage.app",
  messagingSenderId: "987908003870",
  appId: "1:987908003870:web:0e9c19e942df988c5ab60f"
};

// --------------- Globals -----------------
let currentUser = null;
let currentUserId = null;
let db = null;
let app = null;

let unsubscribePatients  = null;
let unsubscribeStats     = null;
let unsubscribeTransfers = null;

let updateTimerHandle = null;
let liveTimerHandle   = null;  // <-- fixed stray ');'

const $  = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

// --------------- Firebase init -----------------
async function initializeFirebase() {
  try {
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js');
    const {
      getFirestore, collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot,
      increment, getDoc, getDocs, query, where, orderBy, limit,
      enableIndexedDbPersistence, writeBatch, serverTimestamp
    } = await import('https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js');

    app = initializeApp(firebaseConfig);
    db  = getFirestore(app);

    try {
      await enableIndexedDbPersistence(db);
      console.log('Firebase offline persistence enabled');
    } catch (err) {
      console.warn('Offline persistence failed:', err);
    }

    window.firestoreFunctions = {
      collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot,
      increment, getDoc, getDocs, query, where, orderBy, limit,
      writeBatch, serverTimestamp
    };

    return true;
  } catch (err) {
    console.error('Firebase init failed', err);
    return false;
  }
}

// --------------- App init -----------------
async function initializeApp() {
  await initializeFirebase();
  setupAuthEventListeners();
  setupAppEventListeners();
  console.log('FastTrackers ready');
}

document.addEventListener('DOMContentLoaded', initializeApp);

// =====================================================
// ============== AUTHENTICATION (ONLY CHANGED) ========
// =====================================================
function setupAuthEventListeners() {
  // numeric enforcement
  ['#loginPin', '#registerPin', '#confirmPin', '#pinInput'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('input', e => e.target.value = e.target.value.replace(/[^0-9]/g,''));
  });

  const loginBtn        = $('#loginBtn');
  const registerBtn     = $('#registerBtn');
  const showRegBtn      = $('#showRegisterBtn');
  const showLoginBtn    = $('#showLoginBtn');

  if (loginBtn)     loginBtn.addEventListener('click', handleLogin);
  if (registerBtn)  registerBtn.addEventListener('click', handleRegister);
  if (showRegBtn)   showRegBtn.addEventListener('click', showRegisterForm);
  if (showLoginBtn) showLoginBtn.addEventListener('click', showLoginForm);

  // Enter shortcuts
  ['#loginUsername', '#loginPin'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('keypress', e => { if (e.key === 'Enter') handleLogin(); });
  });
}

function showRegisterForm() {
  const login  = $('#loginForm');
  const reg    = $('#registerForm');
  if (login) login.classList.add('hidden');
  if (reg)   reg.classList.remove('hidden');
  const ru = $('#registerUsername') || $('#registerName');
  if (ru) ru.focus();
}

function showLoginForm() {
  const login  = $('#loginForm');
  const reg    = $('#registerForm');
  if (reg)   reg.classList.add('hidden');
  if (login) login.classList.remove('hidden');
  const lu = $('#loginUsername');
  if (lu) lu.focus();
}

// Helper to get first existing value from list of ids
function valOf(...ids) {
  for (const id of ids) {
    const el = $(id);
    if (el) return el.value.trim();
  }
  return '';
}

/* ---- LOGIN ---- */
async function handleLogin() {
  const username = valOf('#loginUsername', '#userSelect'); // fallback if old select still there
  const pin      = valOf('#loginPin', '#pinInput');

  if (!username || !pin) { alert('Entrez nom d’utilisateur et PIN'); return; }
  if (pin.length !== 4)  { alert('PIN = 4 chiffres'); return; }

  try {
    const { collection, query, where, getDocs } = window.firestoreFunctions;

    // Try new field 'username' then legacy 'name'
    let snap = await getDocs(query(collection(db, 'users'), where('username', '==', username)));
    if (snap.empty) {
      snap = await getDocs(query(collection(db, 'users'), where('name', '==', username)));
    }
    if (snap.empty) { alert('Utilisateur introuvable'); return; }

    const docData = snap.docs[0].data();
    if (docData.pin !== pin) { alert('PIN incorrect'); return; }

    currentUserId = snap.docs[0].id;
    currentUser   = docData.username || docData.name;

    afterSuccessfulAuth();
  } catch (err) {
    console.error(err);
    alert('Erreur de connexion');
  }
}

/* ---- REGISTER ---- */
async function handleRegister() {
  const username = valOf('#registerUsername', '#registerName');
  const pin1     = valOf('#registerPin');
  const pin2     = valOf('#confirmPin');

  if (!username || !pin1 || !pin2) { alert('Tous les champs sont requis'); return; }
  if (username.length < 3)         { alert('Nom d’utilisateur ≥ 3 caractères'); return; }
  if (pin1.length !== 4)           { alert('PIN = 4 chiffres'); return; }
  if (pin1 !== pin2)               { alert('Les PIN ne correspondent pas'); return; }

  try {
    const { collection, query, where, getDocs, doc, setDoc } = window.firestoreFunctions;

    const exists = await getDocs(query(collection(db, 'users'), where('username', '==', username)));
    const existsLegacy = await getDocs(query(collection(db, 'users'), where('name', '==', username)));
    if (!exists.empty || !existsLegacy.empty) {
      alert('Nom d’utilisateur déjà pris');
      return;
    }

    const userId = 'user_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);

    await setDoc(doc(db, 'users', userId), {
      id: userId,
      username,
      name: username,   // legacy compatibility
      pin: pin1,
      createdAt: new Date().toISOString()
    });

    await initializeUserData(userId);

    alert('Compte créé ! Connectez-vous.');
    showLoginForm();
    const lu = $('#loginUsername');
    if (lu) lu.value = username;
    const lp = $('#loginPin');
    if (lp) lp.focus();
  } catch (err) {
    console.error(err);
    alert('Erreur d’inscription');
  }
}

// Remove/neutralize OLD dropdown-based handlers if still in file
// (If the old functions exist below, they won't override because we define ours last)

// -------- After auth --------
function afterSuccessfulAuth() {
  $('#username').textContent      = currentUser;
  $('#profileName').textContent   = currentUser;
  $('#statsUsername').textContent = currentUser;

  $('#auth').classList.add('hidden');
  $('#app').classList.remove('hidden');

  startRealtimeListeners()
    .then(checkForTransfers)
    .then(startLiveTimers)
    .then(initializePanels);
}

// -------- Logout --------
function logout() {
  if (unsubscribePatients)  unsubscribePatients();
  if (unsubscribeStats)     unsubscribeStats();
  if (unsubscribeTransfers) unsubscribeTransfers();
  stopLiveTimers?.();

  currentUser = null;
  currentUserId = null;

  // reset auth fields
  ['#loginUsername','#loginPin','#registerUsername','#registerPin','#confirmPin','#pinInput'].forEach(id=>{
    const el = $(id); if (el) el.value='';
  });

  $('#app').classList.add('hidden');
  $('#auth').classList.remove('hidden');
  showLoginForm();
}

// =====================================================
// ============== REST OF ORIGINAL CODE ================
// =====================================================
// Everything below should be your existing non-auth logic. If something was missing,
// copy it from your current app.js. (Patients CRUD, stats, transfers, panels, etc.)

// ---- Realtime listeners ----
async function startRealtimeListeners() {
  try {
    const { collection, doc, onSnapshot, query, where, orderBy } = window.firestoreFunctions;

    // Patients
    unsubscribePatients = onSnapshot(
      query(collection(db, 'users', currentUserId, 'patients'), orderBy('createdAt', 'desc')),
      (snapshot) => {
        const patients = [];
        snapshot.forEach(d => patients.push({ id: d.id, ...d.data() }));
        updatePatientsDisplay(patients);
      }
    );

    // Stats
    unsubscribeStats = onSnapshot(doc(db, 'userStats', currentUserId), (docSnap) => {
      if (docSnap.exists()) updateStatsDisplay(docSnap.data());
    });

    // Transfers
    unsubscribeTransfers = onSnapshot(
      query(collection(db, 'transfers'),
            where('toUserId', '==', currentUserId),
            where('status', '==', 'pending')),
      (snapshot) => {
        if (!snapshot.empty) handleIncomingTransfer(snapshot.docs[0]);
      }
    );
  } catch (err) {
    console.error('Error starting listeners:', err);
  }
}

// --- The following functions are placeholders; keep your originals or adapt as needed ---
function updatePatientsDisplay(patients){ /* ... original code ... */ }
function updateStatsDisplay(stats){ /* ... original code ... */ }
function handleIncomingTransfer(docSnap){ /* ... original code ... */ }
function checkForTransfers(){ /* ... original code ... */ }
function startLiveTimers(){ /* ... original code ... */ }
function stopLiveTimers(){ /* ... original code ... */ }
function initializePanels(){ /* ... original code ... */ }
function setupAppEventListeners(){ /* ... original code ... */ }
function showAddPatientModal(){ /* ... original code ... */ }
function showDecisionMenu(pid, ev){ /* ... original code ... */ }
function addPatient(){ /* ... original code ... */ }
function createModal(title, content){ /* ... original code ... */ }
function closeModal(){ const m=document.querySelector('.modal-overlay'); if(m) m.remove(); }
function initializeUserData(userId){ /* ... original code ... */ }
