// FastTrackers PWA - Sliding Panel Version with Username Authentication
// Cleaned & fixed 2025-07-23

'use strict';

console.log('FastTrackers loading…');

// -------------------------------
//  Firebase configuration
// -------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyB8PDbtjAqmEw8-jTuiHGgx2W1a9O1gRQU",
  authDomain: "fasttrackers-sync.firebaseapp.com",
  projectId: "fasttrackers-sync",
  storageBucket: "fasttrackers-sync.firebasestorage.app",
  messagingSenderId: "987908003870",
  appId: "1:987908003870:web:0e9c19e942df988c5ab60f"
};

// -------------------------------
//  Global state
// -------------------------------
let currentUser       = null;
let currentUserId     = null;
let db                = null;
let app               = null;

let unsubscribePatients  = null;
let unsubscribeStats     = null;
let unsubscribeTransfers = null;

let updateTimerHandle = null;
let liveTimerHandle   = null;

const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// -------------------------------
//  Firebase init
// -------------------------------
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

    // expose what we need
    window.firestoreFunctions = {
      collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot,
      increment, getDoc, getDocs, query, where, orderBy, limit,
      writeBatch, serverTimestamp
    };

    return true;
  } catch (err) {
    console.error('Firebase init failed:', err);
    return false;
  }
}

// -------------------------------
//  App bootstrap
// -------------------------------
async function initializeApp() {
  await initializeFirebase();
  setupAuthEventListeners();
  setupAppEventListeners();
  console.log('FastTrackers initialized');
}

document.addEventListener('DOMContentLoaded', initializeApp);

// =======================================================
// =============== AUTHENTICATION SECTION ================
// =======================================================

function setupAuthEventListeners() {
  // PIN fields numeric-only
  ['#loginPin', '#registerPin', '#confirmPin'].forEach(id => {
    $(id).addEventListener('input', e => {
      e.target.value = e.target.value.replace(/[^0-9]/g, '');
    });
  });

  $('#loginBtn')        .addEventListener('click', handleLogin);
  $('#registerBtn')     .addEventListener('click', handleRegister);
  $('#showRegisterBtn') .addEventListener('click', showRegisterForm);
  $('#showLoginBtn')    .addEventListener('click', showLoginForm);

  // Enter shortcuts
  ['#loginUsername', '#loginPin'].forEach(id => {
    $(id).addEventListener('keypress', e => { if (e.key === 'Enter') handleLogin(); });
  });
}

function showRegisterForm() {
  $('#loginForm').classList.add('hidden');
  $('#registerForm').classList.remove('hidden');
  $('#registerUsername').focus();
}

function showLoginForm() {
  $('#registerForm').classList.add('hidden');
  $('#loginForm').classList.remove('hidden');
  $('#loginUsername').focus();
}

// -------- LOGIN ----------
async function handleLogin() {
  const username = $('#loginUsername').value.trim();
  const pin      = $('#loginPin').value.trim();

  if (!username || !pin) {
    alert('Entrez nom d’utilisateur et PIN');
    return;
  }

  if (pin.length !== 4) {
    alert('Le PIN doit contenir 4 chiffres');
    return;
  }

  try {
    const { collection, query, where, getDocs } = window.firestoreFunctions;
    const q = query(collection(db, 'users'), where('username', '==', username));
    const snap = await getDocs(q);

    if (snap.empty) {
      alert('Utilisateur introuvable');
      return;
    }

    const docSnap = snap.docs[0];
    const data    = docSnap.data();

    if (data.pin !== pin) {
      alert('PIN incorrect');
      return;
    }

    currentUserId = docSnap.id;
    currentUser   = data.username;

    afterSuccessfulAuth();
  } catch (err) {
    console.error(err);
    alert('Erreur de connexion');
  }
}

// -------- REGISTER ----------
async function handleRegister() {
  const username = $('#registerUsername').value.trim();
  const pin1     = $('#registerPin').value.trim();
  const pin2     = $('#confirmPin').value.trim();

  if (!username || !pin1 || !pin2) { alert('Tous les champs sont requis'); return; }
  if (username.length < 3)         { alert('Nom trop court (≥3)'); return; }
  if (pin1.length !== 4)           { alert('PIN = 4 chiffres'); return; }
  if (pin1 !== pin2)               { alert('Les PIN ne correspondent pas'); return; }

  try {
    const { collection, query, where, getDocs, doc, setDoc } = window.firestoreFunctions;

    // Unicity
    const exists = await getDocs(query(collection(db, 'users'), where('username', '==', username)));
    if (!exists.empty) { alert('Nom d’utilisateur déjà pris'); return; }

    const userId = 'user_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);

    await setDoc(doc(db, 'users', userId), {
      id: userId,
      username,
      pin: pin1,
      createdAt: new Date().toISOString()
    });

    await initializeUserData(userId);

    alert('Compte créé ! Connectez-vous.');
    showLoginForm();
    $('#loginUsername').value = username;
    $('#loginPin').focus();
  } catch (err) {
    console.error(err);
    alert('Erreur d’inscription');
  }
}

// -------- After auth ----------
function afterSuccessfulAuth() {
  // Fill UI
  $('#username').textContent      = currentUser;
  $('#profileName').textContent   = currentUser;
  $('#statsUsername').textContent = currentUser;

  // Toggle screens
  $('#auth').classList.add('hidden');
  $('#app').classList.remove('hidden');

  startRealtimeListeners()
    .then(checkForTransfers)
    .then(startLiveTimers)
    .then(initializePanels);

  console.log('Logged in as', currentUser);
}

// -------- Logout ----------
function logout() {
  currentUser   = null;
  currentUserId = null;

  // Clear auth fields
  $('#loginUsername').value   = '';
  $('#loginPin').value        = '';
  $('#registerUsername').value = '';
  $('#registerPin').value      = '';
  $('#confirmPin').value       = '';

  // Stop listeners
  if (unsubscribePatients)  unsubscribePatients();
  if (unsubscribeStats)     unsubscribeStats();
  if (unsubscribeTransfers) unsubscribeTransfers();

  // Clear timers
  if (updateTimerHandle) clearInterval(updateTimerHandle);
  if (liveTimerHandle)   clearInterval(liveTimerHandle);

  // Show auth
  $('#app').classList.add('hidden');
  $('#auth').classList.remove('hidden');

  setTimeout(()=>$('#loginUsername').focus(), 100);
}

// =======================================================
// ============== USER DATA INITIALIZATION ===============
// =======================================================
async function initializeUserData(userId) {
  const { doc, setDoc } = window.firestoreFunctions;

  await setDoc(doc(db, 'userStats', userId), {
    added: 0, hospitalized: 0, discharged: 0, transferred: 0,
    totalTimeMinutes: 0, totalPatients: 0,
    lastUpdated: new Date().toISOString()
  });

  await setDoc(doc(db, 'userTemplates', userId), {
    hemodynamique: '', respiratoire: '', digestif: '',
    neurologique: '', osteoarticulaire: '', autre: '',
    lastUpdated: new Date().toISOString()
  });

  await setDoc(doc(db, 'userPhoneBook', userId), {
    phones: [],
    lastUpdated: new Date().toISOString()
  });

  // default task suggestions
  await setDoc(doc(db, 'users', userId, 'taskSuggestions', 'main'), {
    suggestions: [
      { description: "Senior",    timer: 0,  frequency: 1 },
      { description: "Bilan bio", timer: 70, frequency: 1 },
      { description: "ECG",       timer: 0,  frequency: 1 },
      { description: "BU",        timer: 0,  frequency: 1 }
    ]
  });
}

// =======================================================
// ============== REALTIME LISTENERS & UI ================
// =======================================================
async function startRealtimeListeners() {
  try {
    const { collection, doc, onSnapshot, query, where } = window.firestoreFunctions;

    // Patients
    unsubscribePatients = onSnapshot(
      collection(db, 'users', currentUserId, 'patients'),
      (snapshot) => {
        const patients = [];
        snapshot.forEach(d => patients.push({ id: d.id, ...d.data() }));
        updatePatientsDisplay(patients);
      }
    );

    // Stats (use doc directly)
    unsubscribeStats = onSnapshot(
      doc(db, 'userStats', currentUserId),
      (docSnap) => { if (docSnap.exists()) updateStatsDisplay(docSnap.data()); }
    );

    // Transfers
    unsubscribeTransfers = onSnapshot(
      query(collection(db, 'transfers'),
            where('toUserId', '==', currentUserId),
            where('status',   '==', 'pending')),
      (snapshot) => {
        if (!snapshot.empty) handleIncomingTransfer(snapshot.docs[0]);
      }
    );
  } catch (err) {
    console.error('Error starting listeners:', err);
  }
}

// ---------- Patients grid ----------
function updatePatientsDisplay(patients) {
  const grid = $('#grid');

  if (patients.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <h3>Aucun patient actif</h3>
        <p>Cliquez sur "Ajouter un patient" pour commencer</p>
      </div>
    `;
    return;
  }
  grid.innerHTML = patients.map(createPatientCard).join('');
}

function createPatientCard(patient) {
  const timeElapsed     = calculateTimeElapsed(patient.createdAt);
  const tasks           = patient.tasks || [];
  const activeTasks     = tasks.filter(t => !t.completed);
  const completedTasks  = tasks.filter(t => t.completed);

  return `
    <div class="card ${patient.triage}" data-patient-id="${patient.id}">
      <div class="info-box">👤 ${patient.age}ans ${patient.gender === 'M' ? '♂️' : '♀️'}</div>

      <div class="live-timer" data-created-at="${patient.createdAt}">
        ${timeElapsed}
      </div>

      <div class="patient-main">
        <div class="patient-name">
          ${patient.name}
          <button class="patient-notes-btn" onclick="toggleNotes('${patient.id}')">📝</button>
        </div>
        <div class="patient-complaint">${patient.complaint}</div>
      </div>

      ${patient.notes ? `
        <div class="patient-notes" id="notes-${patient.id}" style="display:none;">
          📝 ${patient.notes}
        </div>` : ''}

      <div class="tasks">
        ${activeTasks.map(task => `
          <div class="task" data-task-id="${task.id}">
            <div class="task-content">
              <span class="task-desc">${task.description}</span>
              ${task.timer > 0
                  ? `<span class="task-timer ${isTaskExpired(task) ? 'expired':''}">
                        ${formatTimer(task.timer)}
                     </span>`
                  : ''}
            </div>
            <div class="task-actions">
              <button class="task-check"  onclick="completeTask('${patient.id}','${task.id}')">✓</button>
              <button class="task-delete" onclick="deleteTask('${patient.id}','${task.id}')">✗</button>
            </div>
          </div>`).join('')}

        ${completedTasks.map(task => `
          <div class="task completed" data-task-id="${task.id}">
            <div class="task-content">
              <span class="task-desc">${task.description}</span>
            </div>
          </div>`).join('')}
      </div>

      <div class="actions">
        <button class="btn task"     onclick="showAddTaskModal('${patient.id}')">➕ Tâche</button>
        <button class="btn decision" onclick="showDecisionMenu('${patient.id}', event)">⚡ Décision</button>
      </div>
    </div>
  `;
}

// ---------- Timers & utils ----------
function calculateTimeElapsed(createdAt) {
  const diff = Date.now() - new Date(createdAt).getTime();
  const h = Math.floor(diff / 36e5);
  const m = Math.floor((diff % 36e5) / 6e4);
  return `${h}h ${m}m`;
}

function formatTimer(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function isTaskExpired(task) {
  if (!task.createdAt || task.timer <= 0) return false;
  const elapsed = (Date.now() - new Date(task.createdAt).getTime()) / 60000;
  return elapsed > task.timer;
}

function startLiveTimers() {
  liveTimerHandle = setInterval(() => {
    $$('.live-timer').forEach(t => {
      const createdAt = t.dataset.createdAt;
      if (createdAt) t.textContent = calculateTimeElapsed(createdAt);
    });
  }, 60000);
}

function updateStatsDisplay(stats) {
  $('#statAdded').textContent        = stats.added        || 0;
  $('#statHospitalized').textContent = stats.hospitalized || 0;
  $('#statDischarged').textContent   = stats.discharged   || 0;
  $('#statTransferred').textContent  = stats.transferred  || 0;

  const avgMinutes = stats.totalPatients > 0
    ? stats.totalTimeMinutes / stats.totalPatients : 0;
  const h = Math.floor(avgMinutes / 60);
  const m = Math.round(avgMinutes % 60);
  $('#statAvgTime').textContent = `${h}h ${m}m`;
}

// =======================================================
// ================= PATIENT ACTIONS =====================
// =======================================================
function showAddPatientModal() {
  const modal = createModal('Ajouter un patient', `
    <input type="text" id="patientName" placeholder="Nom du patient" required>
    <input type="number" id="patientAge" placeholder="Âge" min="0" max="120" required>
    <select id="patientGender" required>
      <option value="">Sexe</option>
      <option value="M">Masculin</option>
      <option value="F">Féminin</option>
    </select>
    <textarea id="patientComplaint" placeholder="Motif de consultation" rows="3" required></textarea>
    <textarea id="patientNotes" placeholder="Notes cliniques (optionnel)" rows="3"></textarea>

    <h4>Triage</h4>
    <div class="triage-circles">
      <div class="triage-circle red"    data-triage="red"></div>
      <div class="triage-circle orange" data-triage="orange"></div>
      <div class="triage-circle yellow" data-triage="yellow"></div>
      <div class="triage-circle green"  data-triage="green"></div>
      <div class="triage-circle blue"   data-triage="blue"></div>
      <div class="triage-circle purple" data-triage="purple"></div>
    </div>

    <button class="btn-primary" onclick="addPatient()">Ajouter le patient</button>
  `);

  $$('.triage-circle').forEach(circle => {
    circle.addEventListener('click', () => {
      $$('.triage-circle').forEach(c => c.classList.remove('selected'));
      circle.classList.add('selected');
    });
  });

  return modal;
}

async function addPatient() {
  const name     = $('#patientName').value.trim();
  const age      = parseInt($('#patientAge').value, 10);
  const gender   = $('#patientGender').value;
  const complaint= $('#patientComplaint').value.trim();
  const notes    = $('#patientNotes').value.trim();
  const triageEl = $('.triage-circle.selected');

  if (!name || !age || !gender || !complaint || !triageEl) {
    alert('Veuillez remplir tous les champs obligatoires et sélectionner un triage');
    return;
  }

  try {
    const { doc, setDoc, updateDoc, increment } = window.firestoreFunctions;

    const patientId = 'patient_' + Date.now() + '_' + Math.random().toString(36).substr(2,9);
    const data = {
      id: patientId, name, age, gender, complaint, notes,
      triage: triageEl.dataset.triage,
      createdAt: new Date().toISOString(),
      tasks: []
    };

    await setDoc(doc(db, 'users', currentUserId, 'patients', patientId), data);

    await updateDoc(doc(db, 'userStats', currentUserId), {
      added: increment(1),
      lastUpdated: new Date().toISOString()
    });

    closeModal();
  } catch (err) {
    console.error('Error adding patient:', err);
    alert('Erreur lors de l\'ajout du patient');
  }
}

function toggleNotes(pid) {
  const n = $(`#notes-${pid}`);
  if (n) n.style.display = (n.style.display === 'none') ? 'block' : 'none';
}

// ---------- Tasks ----------
function showAddTaskModal(pid) {
  createModal('Ajouter une tâche', `
    <input type="text" id="taskDescription" placeholder="Description de la tâche" required>
    <input type="number" id="taskTimer" placeholder="Minuteur (minutes, 0 = pas de minuteur)" min="0" value="0">
    <button class="btn-primary" onclick="addTask('${pid}')">Ajouter la tâche</button>
  `);
}

async function addTask(pid) {
  const desc  = $('#taskDescription').value.trim();
  const timer = parseInt($('#taskTimer').value, 10) || 0;
  if (!desc) { alert('Veuillez saisir une description'); return; }

  try {
    const { doc, getDoc, updateDoc } = window.firestoreFunctions;
    const patientDoc = await getDoc(doc(db, 'users', currentUserId, 'patients', pid));
    if (!patientDoc.exists()) return;

    const patient = patientDoc.data();
    const tasks   = patient.tasks || [];

    tasks.push({
      id: Date.now().toString(),
      description: desc,
      timer,
      completed: false,
      createdAt: new Date().toISOString()
    });

    await updateDoc(doc(db, 'users', currentUserId, 'patients', pid), { tasks });
    closeModal();
  } catch (err) {
    console.error('Error adding task:', err);
    alert('Erreur lors de l\'ajout de la tâche');
  }
}

async function completeTask(pid, tid) {
  try {
    const { doc, getDoc, updateDoc } = window.firestoreFunctions;
    const patientDoc = await getDoc(doc(db, 'users', currentUserId, 'patients', pid));
    if (!patientDoc.exists()) return;

    const patient = patientDoc.data();
    const tasks   = patient.tasks || [];
    const i = tasks.findIndex(t => t.id === tid);
    if (i !== -1) {
      tasks[i].completed  = true;
      tasks[i].completedAt= new Date().toISOString();
      await updateDoc(doc(db, 'users', currentUserId, 'patients', pid), { tasks });
    }
  } catch (err) {
    console.error('Error completing task:', err);
  }
}

async function deleteTask(pid, tid) {
  if (!confirm('Supprimer cette tâche ?')) return;
  try {
    const { doc, getDoc, updateDoc } = window.firestoreFunctions;
    const patientDoc = await getDoc(doc(db, 'users', currentUserId, 'patients', pid));
    if (!patientDoc.exists()) return;

    const tasks = (patientDoc.data().tasks || []).filter(t => t.id !== tid);
    await updateDoc(doc(db, 'users', currentUserId, 'patients', pid), { tasks });
  } catch (err) {
    console.error('Error deleting task:', err);
  }
}

// ---------- Decisions ----------
function showDecisionMenu(pid, e) {
  e.stopPropagation();
  const existing = $('.floating-menu');
  if (existing) existing.remove();

  const menu = document.createElement('div');
  menu.className = 'floating-menu';
  menu.style.position = 'absolute';
  menu.style.top  = e.pageY + 'px';
  menu.style.left = e.pageX + 'px';

  menu.innerHTML = `
    <button class="menu-item discharge"   onclick="dischargePatient('${pid}')">🏠 Retour domicile</button>
    <button class="menu-item hospitalize" onclick="hospitalizePatient('${pid}')">🏥 Hospitaliser</button>
    <button class="menu-item transfer"    onclick="showTransferPatientModal('${pid}')">🚑 Transférer</button>
    <button class="menu-item delete"      onclick="deletePatient('${pid}')">🗑️ Supprimer</button>
  `;

  document.body.appendChild(menu);

  setTimeout(() => {
    document.addEventListener('click', function closeMenu() {
      menu.remove();
      document.removeEventListener('click', closeMenu);
    });
  }, 100);
}

async function dischargePatient(pid) {
  if (!confirm('Marquer ce patient comme sorti (retour domicile) ?')) return;
  await handlePatientDecision(pid, 'discharged');
}

async function hospitalizePatient(pid) {
  if (!confirm('Marquer ce patient comme hospitalisé ?')) return;
  await handlePatientDecision(pid, 'hospitalized');
}

async function handlePatientDecision(pid, decision) {
  try {
    const { doc, getDoc, deleteDoc, updateDoc, increment } = window.firestoreFunctions;

    const patientRef = doc(db, 'users', currentUserId, 'patients', pid);
    const patientDoc = await getDoc(patientRef);
    if (!patientDoc.exists()) return;

    const createdAt = patientDoc.data().createdAt;
    const totalMinutes = Math.round((Date.now() - new Date(createdAt)) / 60000);

    // remove patient
    await deleteDoc(patientRef);

    // update stats
    const updates = {
      lastUpdated: new Date().toISOString(),
      totalTimeMinutes: increment(totalMinutes),
      totalPatients:    increment(1)
    };
    updates[decision] = increment(1);

    await updateDoc(doc(db, 'userStats', currentUserId), updates);
  } catch (err) {
    console.error('Decision error:', err);
  }
}

async function deletePatient(pid) {
  if (!confirm('Supprimer ce patient ?')) return;
  try {
    const { doc, deleteDoc } = window.firestoreFunctions;
    await deleteDoc(doc(db, 'users', currentUserId, 'patients', pid));
  } catch (err) {
    console.error('Delete patient error:', err);
  }
}

// =======================================================
// ================= TRANSFERS (Relève) ==================
// =======================================================
function showTransferModal() {
  // simple prompt for now
  const toUser = prompt('Transférer à quel utilisateur (username exact) ?');
  if (!toUser) return;
  transferAllPatients(toUser.trim());
}

async function transferAllPatients(targetUsername) {
  try {
    const { collection, query, where, getDocs, doc, setDoc } = window.firestoreFunctions;

    const snap = await getDocs(query(collection(db, 'users'),
                                     where('username', '==', targetUsername)));
    if (snap.empty) { alert('Utilisateur cible introuvable'); return; }

    const toUserDoc = snap.docs[0];
    const toUserId  = toUserDoc.id;

    // load all patients
    const patientsSnap = await getDocs(collection(db, 'users', currentUserId, 'patients'));
    const patients = [];
    patientsSnap.forEach(d => patients.push({ id: d.id, ...d.data() }));

    if (patients.length === 0) { alert('Aucun patient à transférer'); return; }

    const transferId = 'transfer_' + Date.now();
    await setDoc(doc(db, 'transfers', transferId), {
      id: transferId,
      fromUserId: currentUserId,
      fromUsername: currentUser,
      toUserId,
      toUsername: targetUsername,
      patients,
      status: 'pending',
      createdAt: new Date().toISOString()
    });

    alert('Transfert envoyé');
  } catch (err) {
    console.error('Transfer error:', err);
    alert('Erreur transfert');
  }
}

function handleIncomingTransfer(docSnap) {
  const data = docSnap.data();
  $('#transferCount').textContent = data.patients.length;
  $('#transferFrom').textContent  = data.fromUsername;

  const list = $('#transferPatientsList');
  list.innerHTML = data.patients.map(p => `
    <div class="transfer-item">
      <strong>${p.name}</strong> – ${p.complaint}
    </div>
  `).join('');

  $('#transferAcceptModal').classList.remove('hidden');

  $('#acceptTransfer').onclick = () => acceptTransfer(docSnap.id, data);
  $('#declineTransfer').onclick = () => declineTransfer(docSnap.id);
}

async function acceptTransfer(id, data) {
  try {
    const { doc, setDoc, deleteDoc, updateDoc, increment, writeBatch } = window.firestoreFunctions;

    const batch = writeBatch(db);
    data.patients.forEach(p => {
      batch.set(doc(db, 'users', currentUserId, 'patients', p.id), p);
    });
    await batch.commit();

    await updateDoc(doc(db, 'transfers', id), { status: 'accepted', acceptedAt: new Date().toISOString() });

    $('#transferAcceptModal').classList.add('hidden');
    alert('Transfert accepté');
  } catch (err) {
    console.error('Accept transfer error:', err);
    alert('Erreur');
  }
}

async function declineTransfer(id) {
  try {
    const { doc, updateDoc } = window.firestoreFunctions;
    await updateDoc(doc(db, 'transfers', id), { status: 'declined', declinedAt: new Date().toISOString() });

    $('#transferAcceptModal').classList.add('hidden');
  } catch (err) {
    console.error('Decline transfer error:', err);
  }
}

// =======================================================
// ================= SLIDING PANELS ======================
// =======================================================
function initializePanels() {
  $('#leftEdgeBtn').addEventListener('click',  openLeftPanel);
  $('#rightEdgeBtn').addEventListener('click', openRightPanel);

  $('#leftPanelClose').addEventListener('click',  closeLeftPanel);
  $('#rightPanelClose').addEventListener('click', closeRightPanel);
  $('#panelOverlay').addEventListener('click',    closePanels);

  $('#addPhoneBtn').addEventListener('click', showAddPhoneForm);
  $('#saveTemplatesBtn').addEventListener('click', saveTemplates);

  $$('.copy-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      copyTemplateToClipboard(btn.dataset.field);
    });
  });

  loadTemplatesData();
  loadPhonesData();
}

function openLeftPanel()  { $('#leftPanel').classList.add('active');  $('#panelOverlay').classList.remove('hidden'); loadPhonesData(); }
function openRightPanel() { $('#rightPanel').classList.add('active'); $('#panelOverlay').classList.remove('hidden'); loadTemplatesData(); }
function closeLeftPanel()  { $('#leftPanel').classList.remove('active');  $('#panelOverlay').classList.add('hidden'); }
function closeRightPanel() { $('#rightPanel').classList.remove('active'); $('#panelOverlay').classList.add('hidden'); }
function closePanels()     { $$('.sliding-panel').forEach(p=>p.classList.remove('active')); $('#panelOverlay').classList.add('hidden'); }

// Templates
async function loadTemplatesData() {
  try {
    const { doc, getDoc } = window.firestoreFunctions;
    const tDoc = await getDoc(doc(db, 'userTemplates', currentUserId));
    if (tDoc.exists()) {
      const t = tDoc.data();
      $('#templateHemo').value  = t.hemodynamique     || '';
      $('#templateResp').value  = t.respiratoire      || '';
      $('#templateDig').value   = t.digestif          || '';
      $('#templateNeuro').value = t.neurologique      || '';
      $('#templateOsteo').value = t.osteoarticulaire  || '';
      $('#templateAutre').value = t.autre             || '';
    }
  } catch (err) {
    console.error('Error loading templates:', err);
  }
}

async function saveTemplates() {
  try {
    const { doc, setDoc } = window.firestoreFunctions;
    await setDoc(doc(db, 'userTemplates', currentUserId), {
      hemodynamique:    $('#templateHemo').value.trim(),
      respiratoire:     $('#templateResp').value.trim(),
      digestif:         $('#templateDig').value.trim(),
      neurologique:     $('#templateNeuro').value.trim(),
      osteoarticulaire: $('#templateOsteo').value.trim(),
      autre:            $('#templateAutre').value.trim(),
      lastUpdated: new Date().toISOString()
    });

    const btn = $('#saveTemplatesBtn');
    const orig = btn.textContent;
    btn.textContent = '✅ Sauvegardé!';
    btn.classList.add('success');
    setTimeout(()=>{ btn.textContent = orig; btn.classList.remove('success'); }, 2000);
  } catch (err) {
    console.error('Save templates error:', err);
    alert('Erreur lors de la sauvegarde');
  }
}

async function copyTemplateToClipboard(fieldId) {
  const textarea = $('#' + fieldId);
  const btn      = $(`.copy-btn[data-field="${fieldId}"]`);
  if (textarea && textarea.value.trim()) {
    try {
      await navigator.clipboard.writeText(textarea.value);
      btn.textContent = '✅';
      btn.classList.add('copied');
      setTimeout(()=>{ btn.textContent = '📋'; btn.classList.remove('copied'); }, 1500);
    } catch (err) {
      console.error('Clipboard error:', err);
      textarea.select();
      document.execCommand('copy');
    }
  }
}

// Phone book
async function loadPhonesData() {
  try {
    const { doc, getDoc } = window.firestoreFunctions;
    const pDoc = await getDoc(doc(db, 'userPhoneBook', currentUserId));
    const list = $('#phonesList');
    if (!list) return;

    if (pDoc.exists()) {
      const phones = pDoc.data().phones || [];
      if (phones.length === 0) {
        list.innerHTML = '<div class="no-phones">Aucun numéro enregistré</div>';
        return;
      }
      list.innerHTML = phones.map(p => `
        <div class="phone-item">
          <div class="phone-info">
            <strong>${p.name}</strong>
            <span>${p.number}</span>
          </div>
          <div class="phone-actions">
            <button class="edit-phone-btn"   onclick="editPhone('${p.id}')">✏️</button>
            <button class="delete-phone-btn" onclick="deletePhone('${p.id}')">🗑️</button>
          </div>
        </div>
      `).join('');
    } else {
      list.innerHTML = '<div class="no-phones">Aucun numéro enregistré</div>';
    }
  } catch (err) {
    console.error('Load phones error:', err);
  }
}

function showAddPhoneForm() {
  const name = prompt('Nom du contact:');
  if (!name) return;
  const number = prompt('Numéro de téléphone:');
  if (!number) return;
  addPhone(name.trim(), number.trim());
}

async function addPhone(name, number) {
  try {
    const { doc, getDoc, setDoc } = window.firestoreFunctions;
    const pDoc = await getDoc(doc(db, 'userPhoneBook', currentUserId));
    let phones = [];
    if (pDoc.exists()) phones = pDoc.data().phones || [];

    phones.push({
      id: Date.now().toString(),
      name, number,
      createdAt: new Date().toISOString()
    });

    await setDoc(doc(db, 'userPhoneBook', currentUserId), {
      phones,
      lastUpdated: new Date().toISOString()
    });

    loadPhonesData();
  } catch (err) {
    console.error('Add phone error:', err);
    alert('Erreur lors de l\'ajout du numéro');
  }
}

async function editPhone(id) {
  try {
    const { doc, getDoc, setDoc } = window.firestoreFunctions;
    const pDoc = await getDoc(doc(db, 'userPhoneBook', currentUserId));
    if (!pDoc.exists()) return;

    const phones = pDoc.data().phones || [];
    const idx = phones.findIndex(p => p.id === id);
    if (idx === -1) return;

    const phone = phones[idx];
    const newName   = prompt('Nouveau nom:', phone.name);
    if (!newName) return;
    const newNumber = prompt('Nouveau numéro:', phone.number);
    if (!newNumber) return;

    phones[idx] = { ...phone, name: newName.trim(), number: newNumber.trim(), updatedAt: new Date().toISOString() };

    await setDoc(doc(db, 'userPhoneBook', currentUserId), {
      phones,
      lastUpdated: new Date().toISOString()
    });

    loadPhonesData();
  } catch (err) {
    console.error('Edit phone error:', err);
    alert('Erreur lors de la modification');
  }
}

async function deletePhone(id) {
  if (!confirm('Supprimer ce numéro ?')) return;
  try {
    const { doc, getDoc, setDoc } = window.firestoreFunctions;
    const pDoc = await getDoc(doc(db, 'userPhoneBook', currentUserId));
    if (!pDoc.exists()) return;

    const filtered = (pDoc.data().phones || []).filter(p => p.id !== id);

    await setDoc(doc(db, 'userPhoneBook', currentUserId), {
      phones: filtered,
      lastUpdated: new Date().toISOString()
    });

    loadPhonesData();
  } catch (err) {
    console.error('Delete phone error:', err);
    alert('Erreur lors de la suppression');
  }
}

// =======================================================
// ================== MODAL HELPERS ======================
// =======================================================
function createModal(title, content) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2>${title}</h2>
        <button class="modal-close" onclick="closeModal()">&times;</button>
      </div>
      <div class="modal-content">
        ${content}
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

function closeModal() {
  const modal = $('.modal-overlay');
  if (modal) modal.remove();
}

// =======================================================
// ============== APP-LEVEL EVENT BINDINGS ===============
// =======================================================
function setupAppEventListeners() {
  // Tabs
  $$('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Profile button
  $('#usernameBtn').addEventListener('click', () => switchTab('profile'));

  // Logout
  $('#logout').addEventListener('click', logout);

  // Add patient
  $('#addPatient').addEventListener('click', showAddPatientModal);

  // Transfer button
  $('#transferBtn').addEventListener('click', showTransferModal);

  // Reset stats
  $('#resetStatsBtn').addEventListener('click', resetStats);
}

function switchTab(name) {
  // button state
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  // content
  $$('.tab-content').forEach(c => c.classList.toggle('hidden', c.id !== name));

  if (name === 'profile') {
    $$('.tab').forEach(t => t.classList.remove('active'));
  }
}

// Reset stats
async function resetStats() {
  if (!confirm('Réinitialiser vos statistiques ?')) return;
  try {
    const { doc, setDoc } = window.firestoreFunctions;
    await setDoc(doc(db, 'userStats', currentUserId), {
      added: 0, hospitalized: 0, discharged: 0, transferred: 0,
      totalTimeMinutes: 0, totalPatients: 0,
      lastUpdated: new Date().toISOString()
    });
  } catch (err) {
    console.error('Reset stats error:', err);
  }
}

// expose some functions globally for inline onclicks
window.toggleNotes              = toggleNotes;
window.showAddTaskModal         = showAddTaskModal;
window.addTask                  = addTask;
window.completeTask             = completeTask;
window.deleteTask               = deleteTask;
window.showDecisionMenu         = showDecisionMenu;
window.dischargePatient         = dischargePatient;
window.hospitalizePatient       = hospitalizePatient;
window.showTransferPatientModal = transferAllPatients; // re-use
window.deletePatient            = deletePatient;
window.closeModal               = closeModal;
window.editPhone                = editPhone;
window.deletePhone              = deletePhone;
