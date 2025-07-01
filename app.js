// FastTrackers PWA – Firebase sync + live countdown timers and simple completed task design
console.log('FastTrackers loading with live timers, French “Terminé” pill and offline support…');

// Firebase configuration
const firebaseConfig = {
  apiKey: 'AIzaSyB8PDbtjAqmEw8-jTuiHGgx2W1a9O1gRQU',
  authDomain: 'fasttrackers-sync.firebaseapp.com',
  projectId: 'fasttrackers-sync',
  storageBucket: 'fasttrackers-sync.firebasestorage.app',
  messagingSenderId: '987908003870',
  appId: '1:987908003870:web:0e9c19e942df988c5ab60f'
};

// Globals
let currentUser = null;
let db = null;
let unsubscribePatients = null;
let unsubscribeStats = null;
let updateTimerHandle = null;

// DOM helpers
const $  = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

// Firebase initialization with offline persistence
async function initFirebase () {
  const { initializeApp } = await import('https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js');
  const {
    getFirestore, collection, doc, setDoc, updateDoc, deleteDoc,
    onSnapshot, increment, getDoc, enableIndexedDbPersistence
  } = await import('https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js');

  initializeApp(firebaseConfig);
  db = getFirestore();
  try { await enableIndexedDbPersistence(db); }
  catch (err) { console.warn('IndexedDB persistence failed', err); }

  window.fs = { collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, increment, getDoc };
}

// Bootstrap
async function boot () {
  await initFirebase();
  bindStaticUI();
}
document.addEventListener('DOMContentLoaded', boot);

// Static UI bindings
function bindStaticUI () {
  $$('.user-btn').forEach(btn =>
    btn.addEventListener('click', () => login(btn.dataset.user)));
  $$('.tab').forEach(tab =>
    tab.addEventListener('click', () => switchTab(tab.dataset.tab)));
  $('#addPatient').addEventListener('click', showAddPatientModal);
  $('#logout').addEventListener('click', logout);
  $('#resetStats').addEventListener('click', resetStatistics);
  document.addEventListener('click', globalDelegation);
}

// Login / Logout
async function login (user) {
  currentUser = user;
  $('#username').textContent = user;
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  startRealtimeListeners();
  startLiveTimers();
}
function logout () {
  if (unsubscribePatients) unsubscribePatients();
  if (unsubscribeStats)     unsubscribeStats();
  stopLiveTimers();
  currentUser = null;
  $('#app').classList.add('hidden');
  $('#login').classList.remove('hidden');
}

// Realtime listeners
function startRealtimeListeners () {
  const { collection, doc, onSnapshot } = window.fs;
  unsubscribePatients = onSnapshot(
    collection(db, 'users', currentUser, 'patients'),
    snap => renderPatients(snap)
  );
  unsubscribeStats = onSnapshot(
    doc(db, 'users', currentUser, 'stats', 'main'),
    d => updateStatsDisplay(d.exists() ? d.data() : {})
  );
}

// Rendering
function renderPatients (snap) {
  const grid = $('#grid');
  if (snap.empty) {
    grid.innerHTML = `<div class="empty-state"><p>Aucun patient actif</p><p>Cliquez sur “Ajouter un patient” pour commencer</p></div>`;
    return;
  }
  const pts = [];
  snap.forEach(d => pts.push(d.data()));
  pts.sort((a, b) =>
    ({red:1,orange:2,yellow:3,green:4,blue:5,purple:6}[a.triage] -
     {red:1,orange:2,yellow:3,green:4,blue:5,purple:6}[b.triage]));
  grid.innerHTML = pts.map(p => patientCardHTML(p)).join('');
}
function patientCardHTML (p) {
  return `
    <div class="card ${p.triage}" data-id="${p.id}">
      <div class="info-box editable" data-pid="${p.id}">
        📍 <span>${p.location || '—'}</span><br>
        📱 <span>${p.nurse     || '—'}</span>
      </div>
      <div class="patient-main">
        <h3 class="patient-name">${p.name}</h3>
        <p  class="patient-complaint">${p.complaint}</p>
      </div>
      <div class="tasks">
        ${(p.tasks||[]).map(t => taskHTML(p.id, t)).join('')}
      </div>
      <div class="actions">
        <button class="btn task"     data-pid="${p.id}">📋 Tâches</button>
        <button class="btn decision" data-pid="${p.id}">⚖️ Décision</button>
      </div>
    </div>`;
}
function taskHTML (pid, t) {
  const due   = t.dueAt ? `data-dueat="${t.dueAt}"` : '';
  const timer = t.dueAt ? `<span class="task-timer" ${due}>${formatDiff(t.dueAt)}</span>` : '';
  return `
    <div class="task ${t.completed?'completed':''}">
      <div class="task-content">
        <span class="task-desc">${t.description}</span>
        ${t.completed ? '' : timer}
      </div>
      ${t.completed ? '' :
        `<button class="task-check" data-pid="${pid}" data-tid="${t.id}">✓</button>`}
    </div>`;
}

// Live countdown timers
function startLiveTimers () {
  if (updateTimerHandle) return;
  updateTimerHandle = setInterval(updateAllTimers, 1000);
}
function stopLiveTimers () {
  clearInterval(updateTimerHandle);
  updateTimerHandle = null;
}
function updateAllTimers () {
  const now = Date.now();
  $$('.task:not(.completed) .task-timer').forEach(el => {
    const target = new Date(el.dataset.dueat).getTime();
    const diff   = target - now;
    if (diff <= 0) {
      el.textContent = '00:00';
      el.classList.add('expired');
    } else {
      el.textContent = formatDiff(target);
      el.classList.remove('expired');
    }
  });
}
const formatDiff = ts => {
  let ms = typeof ts === 'number' ? ts - Date.now() : new Date(ts) - Date.now();
  if (ms < 0) ms = 0;
  const m = Math.floor(ms / 60000).toString().padStart(2,'0');
  const s = Math.floor(ms % 60000 / 1000).toString().padStart(2,'0');
  return `${m}:${s}`;
};

// Global click delegation
async function globalDelegation (e) {
  const t = e.target;
  if (t.matches('.btn.task'))          return showAddTaskModal(t.dataset.pid);
  if (t.matches('.btn.decision'))      return showDecisionMenu(t.dataset.pid, t);
  if (t.matches('.task-check'))        return completeTask(t.dataset.pid, t.dataset.tid);
  if (t.closest('.info-box.editable')) return editPatientInfo(t.closest('.info-box').dataset.pid);
  if (t.matches('.menu-item'))         return handleDecision(t.dataset.pid, t.dataset.action);
}

// --- Modal and CRUD logic (unchanged) ---
// Paste your existing implementations for:
// showAddPatientModal, saveNewPatient,
// showAddTaskModal, saveNewTask,
// showDecisionMenu, handleDecision,
// completeTask, editPatientInfo, savePatientInfo,
// updateStats, updateStatsDisplay, resetStatistics,
// switchTab
// (If you need these templates, let me know!)
