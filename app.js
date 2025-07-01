// Firebase import
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js';
import { getFirestore, collection, doc, setDoc, getDoc, deleteDoc, onSnapshot, updateDoc } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyB8PDbtjAqmEw8-jTuiHGgx2W1a9O1gRQU",
  authDomain: "fasttrackers-sync.firebaseapp.com",
  projectId: "fasttrackers-sync",
  storageBucket: "fasttrackers-sync.firebasestorage.app",
  messagingSenderId: "987908003870",
  appId: "1:987908003870:web:0e9c19e942df988c5ab60f"
};
initializeApp(firebaseConfig);
const db = getFirestore();

const userProfiles = ['Cristian','Ilinca','Guest'];
let currentUser = null;
let unsubscribePatients = null;
let unsubscribeStats = null;
const patientsData = {}; // per user
const statsData = {}; // per user

// DOM helpers
const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);
const byId = id => document.getElementById(id);

// Load data from Firestore
async function loadUserData() {
  for (const profile of userProfiles) {
    // Patients
    const snap = await getDocs(collection(db, profile));
    patientsData[profile] = [];
    snap.forEach(doc => { patientsData[profile].push(doc.data()); });
    // Stats
    const statRef = doc(db, profile + '_stats', 'main');
    const statSnap = await getDoc(statRef);
    statsData[profile] = statSnap.exists() ? statSnap.data() : { ad:0, ho:0, ho2:0, de:0 };
  }
}

// Save patient
async function savePatient(patient) {
  await setDoc(doc(db, currentUser, patient.id), patient);
}
// Save stats
async function saveStats() {
  await setDoc(doc(db, currentUser + '_stats', 'main'), statsData[currentUser]);
}

// Start real-time sync
function startRealtime() {
  if (unsubscribePatients) unsubscribePatients();
  unsubscribePatients = onSnapshot(collection(db, currentUser), snap => {
    const grid = $('#grid');
    grid.innerHTML = '';
    snap.forEach(docSnap => {
      const p = docSnap.data();
      grid.appendChild(renderCard(p));
    });
  });
  if (unsubscribeStats) unsubscribeStats();
  unsubscribeStats = onSnapshot(doc(db, currentUser + '_stats', 'main'), snap => {
    const s = snap.data() || { ad:0, ho:0, ho2:0, de:0 };
    $('#sAdded').textContent = s.ad;
    $('#sHosp').textContent = s.ho;
    $('#sHome').textContent = s.ho2;
    $('#sDel').textContent = s.de;
  });
}

// Login
$('#login').addEventListener('click', e => {
  if (!e.target.dataset.user) return;
  currentUser = e.target.dataset.user;
  $('#user-name').textContent = currentUser;
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  startRealtime();
});

// Logout
$('#logout').onclick = () => {
  if (unsubscribePatients) unsubscribePatients();
  if (unsubscribeStats) unsubscribeStats();
  currentUser = null;
  $('#app').classList.add('hidden');
  $('#login').classList.remove('hidden');
};

// Add patient
$('#addPatient').onclick = () => {
  showModal('addPatientModal');
};
async function addPatient() {
  const name = $('#patientName').value.trim();
  const comp = $('#patientComplaint').value.trim();
  const tri = $('#patientTriage').value;
  const loc = $('#patientLocation').value.trim();
  const nurse = $('#patientNurse').value.trim();
  if (!name || !comp || !tri) return alert('Champs obligatoires');
  const id = 'p_' + Date.now();
  const patient = { id, name, comp, tri, loc, nurse, tasks: [] };
  await setDoc(doc(db, currentUser, id), patient);
  statsData[currentUser].ad++;
  await saveStats();
  hideModal('addPatientModal');
}
async function addTask() {
  if (!app.currentPatientId) return;
  const desc = $('#taskDescription').value.trim();
  const min = parseInt($('#taskMinutes').value);
  if (!desc) return alert('Description requise');
  const dueAt = min > 0 ? new Date(Date.now() + min * 60000).toISOString() : null;
  const task = { id: 't_' + Date.now(), desc, dueAt, done: false };
  const patientRef = doc(db, currentUser, app.currentPatientId);
  await updateDoc(patientRef, { tasks: [...(await getDoc(patientRef)).data().tasks, task] });
  if (dueAt) {
    app.timers.set(task.id, { patientName: (await getDoc(patientRef)).data().name, desc, dueAt, notified: false });
  }
  hideModal('addTaskModal');
  renderPatients();
}
async function completeTask(patientId, taskId) {
  const patientRef = doc(db, currentUser, patientId);
  const p = (await getDoc(patientRef)).data();
  p.tasks = p.tasks.filter(t => t.id !== taskId);
  await setDoc(patientRef, p);
  app.timers.delete(taskId);
  renderPatients();
}
async function deletePatient(patientId) {
  await deleteDoc(doc(db, currentUser, patientId));
  statsData[currentUser].de++;
  await saveStats();
  renderPatients();
}
async function hospitalizePatient(patientId) {
  // For simplicity, just remove from collection
  await deleteDoc(doc(db, currentUser, patientId));
  statsData[currentUser].ho++;
  await saveStats();
  renderPatients();
}
async function returnToHome(patientId) {
  // For simplicity, just remove from collection
  await deleteDoc(doc(db, currentUser, patientId));
  statsData[currentUser].ho2++;
  await saveStats();
  renderPatients();
}

// Render patient card
function renderCard(p) {
  const card = document.createElement('div');
  card.className = `patient-card triage-${p.tri}`;
  card.innerHTML = `
    <div class="info-box" data-id="${p.id}" onclick="app.showEditInfo('${p.id}')">
      📍 ${p.loc || '--'}<br/>📱 ${p.nurse || '--'}
    </div>
    <h3>${p.name}</h3>
    <p>${p.comp}</p>
    <div class="tasks">${renderTasks(p)}</div>
    <div class="actions">
      <button class="btn task" data-id="${p.id}">📋 Tâches</button>
      <button class="btn dec" data-id="${p.id}">⚖️ Décision</button>
    </div>`;
  // Add event listeners
  setTimeout(() => {
    card.querySelector('.task').onclick = () => showAddTaskModal(p.id);
    card.querySelector('.dec').onclick = (e) => showDecisionMenu(p.id, e.currentTarget);
  }, 0);
  return card;
}
function renderTasks(p) {
  return p.tasks.filter(t => !t.done).map(t => `
    <div class="task">
      <div class="task-content">
        <div class="task-desc">${t.desc}</div>
        ${t.dueAt ? `<div class="task-timer" id="timer-${t.id}">--:--</div>` : ''}
      </div>
      <button class="task-check" onclick="app.completeTask('${p.id}', '${t.id}')" title="Terminer">✓</button>
    </div>
  `).join('');
}

// Timer update
setInterval(() => {
  for (const [id, t] of app.timers) {
    const el = document.getElementById('timer-' + id);
    if (!el) continue;
    const remaining = new Date(t.dueAt) - Date.now();
    if (remaining <= 0) {
      el.textContent = '00:00';
      if (!t.notified) {
        t.notified = true;
        app.showNotification('⏰ Rappel', `${t.patientName}: ${t.desc}`);
      }
    } else {
      const m = Math.floor(remaining / 60000).toString().padStart(2,'0');
      const s = Math.floor((remaining % 60000)/1000).toString().padStart(2,'0');
      el.textContent = `${m}:${s}`;
    }
  }
}, 1000);

// Utility
function showAddTaskModal(pid) {
  app.currentPatientId = pid;
  showModal('addTaskModal');
}
function showDecisionMenu(pid, btn) {
  app.hideAllMenus();
  const menu = document.createElement('div');
  menu.className='floating-menu show';
  menu.innerHTML=`
    <button class="menu-item" style="border-left:4px solid #27ae60" onclick="app.returnToHome('${pid}')">🏠 Retour à domicile</button>
    <button class="menu-item" style="border-left:4px solid #f1c40f" onclick="app.hospitalizePatient('${pid}')">🏥 Hospitalisation</button>
    <button class="menu-item" style="border-left:4px solid #b22222" onclick="app.deletePatient('${pid}')">🗑️ Supprimer le patient</button>`;
  btn.closest('.patient-card').appendChild(menu);
  document.addEventListener('click', e => {
    if (!menu.contains(e.target) && e.target !== btn) { menu.remove(); }
  }, { once:true });
}
function showModal(id) {
  const overlay = document.createElement('div');
  overlay.className='modal-overlay show';
  overlay.id=id;
  overlay.innerHTML=`
    <div class="modal">
      <button class="modal-close" onclick="app.hideModal('${id}')">&times;</button>
      <div id="${id}-content"></div>
    </div>`;
  document.body.appendChild(overlay);
}
app.showAddTaskModal = () => {
  showModal('addTaskModal');
  $('#addTaskForm').onsubmit = () => {
    app.addTask();
  };
};
app.showEditInfo = (pid) => {
  app.currentEditPatientId=pid;
  const p = (await getDoc(doc(db, currentUser, pid))).data();
  $('#editLocation').value=p.loc||'';
  $('#editNurse').value=p.nurse||'';
  showModal('editInfoModal');
};
app.hideModal = (id) => {
  document.getElementById(id).remove();
};
app.showDecisionMenu = showDecisionMenu;
app.showNotification = (title, msg) => {
  const n = document.createElement('div');
  n.className='notification show';
  n.innerHTML=`
    <div class="notification-header">
      <div class="notification-title">${title}</div>
      <button class="notification-close" onclick="this.parentElement.parentElement.remove()">&times;</button>
    </div>
    <div class="notification-content">${msg}</div>`;
  document.body.appendChild(n);
  setTimeout(()=>n.classList.remove('show'), 5000);
};
app.hideAllMenus = () => {
  document.querySelectorAll('.floating-menu').forEach(m=>m.remove());
};
app.showModal = showModal;
app.hideModal = (id) => {
  document.getElementById(id).remove();
};
