// FastTrackers PWA with Enhanced Features - Complete Authentication System
console.log('FastTrackers loading with enhanced features...');

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyB8PDbtjAqmEw8-jTuiHGgx2W1a9O1gRQU",
  authDomain: "fasttrackers-sync.firebaseapp.com",
  projectId: "fasttrackers-sync",
  storageBucket: "fasttrackers-sync.firebasestorage.app",
  messagingSenderId: "987908003870",
  appId: "1:987908003870:web:0e9c19e942df988c5ab60f"
};

// Global state
let currentUser = null;
let currentUserId = null;
let db = null;
let unsubscribePatients = null;
let unsubscribeStats = null;
let unsubscribeNotes = null;
let app = null;
let updateTimerHandle = null;

// DOM helpers
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

// Initialize Firebase
async function initializeFirebase() {
  try {
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js');
    const { 
      getFirestore, 
      collection, 
      doc, 
      setDoc, 
      updateDoc, 
      deleteDoc, 
      onSnapshot, 
      increment,
      getDoc,
      getDocs,
      query,
      where,
      orderBy,
      enableIndexedDbPersistence,
      writeBatch,
      serverTimestamp
    } = await import('https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js');
    
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    
    try {
      await enableIndexedDbPersistence(db);
      console.log('Firebase offline persistence enabled');
    } catch (error) {
      console.warn('Offline persistence failed:', error);
    }
    
    window.firestoreFunctions = {
      collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, increment, getDoc, getDocs, query, where, orderBy, writeBatch, serverTimestamp
    };
    
    console.log('Firebase initialized successfully');
    return true;
  } catch (error) {
    console.error('Firebase initialization failed:', error);
    return false;
  }
}

// Initialize app
async function initializeApp() {
  console.log('Initializing FastTrackers...');
  
  await initializeFirebase();
  await loadUsers();
  setupAuthEventListeners();
  setupAppEventListeners();
  
  console.log('FastTrackers initialized successfully');
}

// Load users for login dropdown
async function loadUsers() {
  try {
    const { collection, getDocs } = window.firestoreFunctions;
    const usersSnapshot = await getDocs(collection(db, 'users'));
    const userSelect = $('#userSelect');
    
    userSelect.innerHTML = '<option value="">Sélectionner un utilisateur</option>';
    
    usersSnapshot.forEach(doc => {
      const user = doc.data();
      const option = document.createElement('option');
      option.value = doc.id;
      option.textContent = user.name;
      userSelect.appendChild(option);
    });
  } catch (error) {
    console.error('Error loading users:', error);
  }
}

// Authentication event listeners
function setupAuthEventListeners() {
  $('#userSelect').addEventListener('change', (e) => {
    const userId = e.target.value;
    const pinInput = $('#pinInput');
    const loginBtn = $('#loginBtn');
    
    if (userId) {
      pinInput.classList.remove('hidden');
      loginBtn.classList.remove('hidden');
      pinInput.focus();
    } else {
      pinInput.classList.add('hidden');
      loginBtn.classList.add('hidden');
      pinInput.value = '';
    }
  });

  $('#pinInput').addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/[^0-9]/g, '');
  });

  $('#loginBtn').addEventListener('click', handleLogin);
  $('#showRegisterBtn').addEventListener('click', showRegisterForm);
  $('#showLoginBtn').addEventListener('click', showLoginForm);
  $('#registerBtn').addEventListener('click', handleRegister);
  
  // Enter key support
  $('#pinInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleLogin();
  });
}

// Show/hide auth forms
function showRegisterForm() {
  $('#loginForm').classList.add('hidden');
  $('#registerForm').classList.remove('hidden');
}

function showLoginForm() {
  $('#registerForm').classList.add('hidden');
  $('#loginForm').classList.remove('hidden');
}

// Handle user registration
async function handleRegister() {
  const name = $('#registerName').value.trim();
  const pin = $('#registerPin').value.trim();
  const confirmPin = $('#confirmPin').value.trim();
  
  if (!name || !pin || !confirmPin) {
    alert('Veuillez remplir tous les champs');
    return;
  }
  
  if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
    alert('Le PIN doit contenir exactement 4 chiffres');
    return;
  }
  
  if (pin !== confirmPin) {
    alert('Les codes PIN ne correspondent pas');
    return;
  }
  
  try {
    const { collection, doc, setDoc, getDocs, query, where } = window.firestoreFunctions;
    
    // Check if user already exists
    const existingUsers = await getDocs(query(collection(db, 'users'), where('name', '==', name)));
    if (!existingUsers.empty) {
      alert('Un utilisateur avec ce nom existe déjà');
      return;
    }
    
    // Create new user
    const userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const userData = {
      id: userId,
      name: name,
      pin: pin,
      createdAt: new Date().toISOString()
    };
    
    await setDoc(doc(db, 'users', userId), userData);
    
    // Initialize user stats
    await setDoc(doc(db, 'users', userId, 'stats', 'main'), {
      added: 0,
      hospitalized: 0,
      discharged: 0,
      deleted: 0,
      totalTime: 0,
      totalPatients: 0
    });
    
    alert('Compte créé avec succès!');
    await loadUsers();
    showLoginForm();
    
    // Auto-select the new user
    $('#userSelect').value = userId;
    $('#userSelect').dispatchEvent(new Event('change'));
    
  } catch (error) {
    console.error('Error registering user:', error);
    alert('Erreur lors de la création du compte');
  }
}

// Handle user login
async function handleLogin() {
  const userId = $('#userSelect').value;
  const pin = $('#pinInput').value;
  
  if (!userId || !pin) {
    alert('Veuillez sélectionner un utilisateur et saisir le PIN');
    return;
  }
  
  try {
    const { doc, getDoc } = window.firestoreFunctions;
    const userDoc = await getDoc(doc(db, 'users', userId));
    
    if (!userDoc.exists()) {
      alert('Utilisateur non trouvé');
      return;
    }
    
    const userData = userDoc.data();
    if (userData.pin !== pin) {
      alert('PIN incorrect');
      return;
    }
    
    // Login successful
    currentUser = userData.name;
    currentUserId = userId;
    
    $('#username').textContent = currentUser;
    $('#profileName').textContent = currentUser;
    
    $('#auth').classList.add('hidden');
    $('#app').classList.remove('hidden');
    
    await startRealtimeListeners();
    startLiveTimers();
    
    console.log('Login successful for:', currentUser);
    
  } catch (error) {
    console.error('Login error:', error);
    alert('Erreur de connexion');
  }
}

// Start real-time listeners
async function startRealtimeListeners() {
  try {
    const { collection, doc, onSnapshot, orderBy, query } = window.firestoreFunctions;
    
    // Patients listener
    const patientsQuery = query(
      collection(db, 'users', currentUserId, 'patients'),
      orderBy('createdAt', 'desc')
    );
    
    unsubscribePatients = onSnapshot(patientsQuery, (snapshot) => {
      renderPatients(snapshot);
    });
    
    // Stats listener
    unsubscribeStats = onSnapshot(doc(db, 'users', currentUserId, 'stats', 'main'), (doc) => {
      const stats = doc.exists() ? doc.data() : {};
      updateStatsDisplay(stats);
    });
    
    // Notes listener
    const notesQuery = query(
      collection(db, 'users', currentUserId, 'notes'),
      orderBy('createdAt', 'desc')
    );
    
    unsubscribeNotes = onSnapshot(notesQuery, (snapshot) => {
      renderNotes(snapshot);
    });
    
    // Load daily stats
    await loadDailyStats();
    
  } catch (error) {
    console.error('Error setting up listeners:', error);
  }
}

// Setup app event listeners
function setupAppEventListeners() {
  // Navigation
  $$('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });
  
  $('#logout').addEventListener('click', logout);
  $('#profileBtn').addEventListener('click', () => switchTab('profile'));
  
  // Patient management
  $('#addPatient').addEventListener('click', showAddPatientModal);
  $('#transferBtn').addEventListener('click', showTransferModal);
  
  // Profile management
  $('#editNameBtn').addEventListener('click', showEditNameModal);
  $('#changePinBtn').addEventListener('click', showChangePinModal);
  $('#deleteAccountBtn').addEventListener('click', handleDeleteAccount);
  
  // Notes management
  $('#notesBtn').addEventListener('click', toggleNotesPanel);
  $('#addNoteBtn').addEventListener('click', showAddNoteModal);
  
  // Stats
  $('#resetStats').addEventListener('click', resetStats);
  
  // Global click delegation
  document.addEventListener('click', globalClickHandler);
}

// Global click handler
function globalClickHandler(e) {
  if (e.defaultPrevented) return;
  
  // Task buttons
  if (e.target.matches('.btn.task')) {
    e.preventDefault();
    showAddTaskModal(e.target.dataset.pid);
    return;
  }
  
  // Decision buttons
  if (e.target.matches('.btn.decision')) {
    e.preventDefault();
    showDecisionMenu(e.target.dataset.pid, e.target);
    return;
  }
  
  // Task actions
  if (e.target.matches('.task-check')) {
    e.preventDefault();
    completeTask(e.target.dataset.pid, e.target.dataset.tid);
    return;
  }
  
  if (e.target.matches('.task-delete')) {
    e.preventDefault();
    deleteTask(e.target.dataset.pid, e.target.dataset.tid);
    return;
  }
  
  // Patient info editing
  if (e.target.matches('.info-box.editable') || e.target.closest('.info-box.editable')) {
    e.preventDefault();
    const infoBox = e.target.matches('.info-box.editable') ? e.target : e.target.closest('.info-box.editable');
    editPatientInfo(infoBox.dataset.pid);
    return;
  }
  
  // Decision menu items
  if (e.target.matches('.menu-item')) {
    e.preventDefault();
    handlePatientDecision(e.target.dataset.pid, e.target.dataset.action);
    return;
  }
  
  // Note actions
  if (e.target.matches('.note-edit')) {
    e.preventDefault();
    editNote(e.target.dataset.noteid);
    return;
  }
  
  if (e.target.matches('.note-delete')) {
    e.preventDefault();
    deleteNote(e.target.dataset.noteid);
    return;
  }
  
  // Close notes panel if clicked outside
  if (!e.target.closest('.notes-panel') && !e.target.closest('.notes-btn')) {
    const notesPanel = $('#notesPanel');
    if (!notesPanel.classList.contains('hidden')) {
      notesPanel.classList.add('hidden');
    }
  }
}

// Logout function
function logout() {
  if (unsubscribePatients) unsubscribePatients();
  if (unsubscribeStats) unsubscribeStats();
  if (unsubscribeNotes) unsubscribeNotes();
  stopLiveTimers();
  
  currentUser = null;
  currentUserId = null;
  
  $('#auth').classList.remove('hidden');
  $('#app').classList.add('hidden');
  
  // Reset forms
  $('#userSelect').value = '';
  $('#pinInput').value = '';
  $('#pinInput').classList.add('hidden');
  $('#loginBtn').classList.add('hidden');
  showLoginForm();
}

// Tab switching
function switchTab(tabName) {
  $$('.tab').forEach(tab => tab.classList.remove('active'));
  $(`[data-tab="${tabName}"]`).classList.add('active');
  
  $$('.tab-content').forEach(content => content.classList.add('hidden'));
  $(`#${tabName}`).classList.remove('hidden');
}

// Live timers
function startLiveTimers() {
  if (updateTimerHandle) return;
  updateTimerHandle = setInterval(updateAllTimers, 1000);
}

function stopLiveTimers() {
  clearInterval(updateTimerHandle);
  updateTimerHandle = null;
}

function updateAllTimers() {
  const now = Date.now();
  $$('.task:not(.completed) .task-timer').forEach(el => {
    const target = new Date(el.dataset.dueat).getTime();
    const diff = target - now;
    if (diff <= 0) {
      el.textContent = '00:00';
      el.classList.add('expired');
    } else {
      el.textContent = formatTime(diff);
      el.classList.remove('expired');
    }
  });
}

function formatTime(ms) {
  if (ms <= 0) return '00:00';
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Patient management
function renderPatients(snapshot) {
  const grid = $('#grid');
  
  if (snapshot.empty) {
    grid.innerHTML = '<div class="empty-state"><p>Aucun patient actif</p><p>Cliquez sur "Ajouter un patient" pour commencer</p></div>';
    return;
  }
  
  const patients = [];
  snapshot.forEach(doc => {
    patients.push(doc.data());
  });
  
  const triagePriority = { red: 1, orange: 2, yellow: 3, green: 4, blue: 5, purple: 6 };
  patients.sort((a, b) => (triagePriority[a.triage] || 6) - (triagePriority[b.triage] || 6));
  
  grid.innerHTML = patients.map(patient => createPatientCardHTML(patient)).join('');
}

function createPatientCardHTML(patient) {
  const tasks = patient.tasks || [];
  
  return `
    <div class="card ${patient.triage}" data-patient-id="${patient.id}">
      <div class="info-box editable" data-pid="${patient.id}">
        <div class="info-location">📍 <span class="editable-text">${patient.location || 'Modifier'}</span></div>
        <div class="info-nurse">📱 <span class="editable-text">${patient.nurse || 'Modifier'}</span></div>
      </div>
      <div class="patient-main">
        <h3 class="patient-name">${patient.name}</h3>
        <p class="patient-complaint">${patient.complaint}</p>
      </div>
      <div class="tasks">
        ${tasks.map(task => createTaskHTML(patient.id, task)).join('')}
      </div>
      <div class="actions">
        <button class="btn task" data-pid="${patient.id}">📋 Tâches</button>
        <button class="btn decision" data-pid="${patient.id}">⚖️ Décision</button>
      </div>
    </div>
  `;
}

function createTaskHTML(patientId, task) {
  const isCompleted = task.completed;
  const timer = task.dueAt && !isCompleted ? `<span class="task-timer" data-dueat="${task.dueAt}">${formatTime(new Date(task.dueAt) - Date.now())}</span>` : '';
  
  return `
    <div class="task ${isCompleted ? 'completed' : ''}">
      <div class="task-content">
        <span class="task-desc">${task.description}</span>
        ${timer}
      </div>
      ${!isCompleted ? `
        <div class="task-actions">
          <button class="task-check" data-pid="${patientId}" data-tid="${task.id}">✓</button>
          <button class="task-delete" data-pid="${patientId}" data-tid="${task.id}">🗑️</button>
        </div>
      ` : ''}
    </div>
  `;
}

function showAddPatientModal() {
  const modal = createModal('➕ Nouveau patient', `
    <input id="patientName" placeholder="Nom du patient *" required>
    <input id="patientComplaint" placeholder="Motif de consultation *" required>
    <select id="patientTriage" required>
      <option value="">Niveau de triage *</option>
      <option value="red">Rouge - Critique</option>
      <option value="orange">Orange - Très urgent</option>
      <option value="yellow">Jaune - Urgent</option>
      <option value="green">Vert - Semi-urgent</option>
      <option value="blue">Bleu - Moins urgent</option>
      <option value="purple">Violet - Non urgent</option>
    </select>
    <input id="patientLocation" placeholder="📍 Localisation">
    <input id="patientNurse" placeholder="📱 Numéro infirmière">
    <button class="btn-primary" id="savePatient">Enregistrer</button>
  `);
  
  $('#savePatient').addEventListener('click', savePatient);
}

async function savePatient() {
  const name = $('#patientName').value.trim();
  const complaint = $('#patientComplaint').value.trim();
  const triage = $('#patientTriage').value;
  const location = $('#patientLocation').value.trim();
  const nurse = $('#patientNurse').value.trim();
  
  if (!name || !complaint || !triage) {
    alert('Veuillez remplir tous les champs obligatoires');
    return;
  }
  
  try {
    const { doc, setDoc } = window.firestoreFunctions;
    const patientId = generateId('patient');
    const now = new Date().toISOString();
    
    const patientData = {
      id: patientId,
      name,
      complaint,
      triage,
      location,
      nurse,
      tasks: [],
      createdAt: now,
      userId: currentUserId
    };
    
    await setDoc(doc(db, 'users', currentUserId, 'patients', patientId), patientData);
    await updateStats('added', 1);
    await updateDailyStats('added', 1);
    
    $('.modal-overlay').remove();
    console.log('Patient added:', name);
    
  } catch (error) {
    console.error('Error adding patient:', error);
    alert('Erreur lors de l\'ajout du patient');
  }
}

function showAddTaskModal(patientId) {
  const modal = createModal('📋 Nouvelle tâche', `
    <input id="taskDescription" placeholder="Description de la tâche *" required>
    <input id="taskMinutes" type="number" placeholder="⏰ Délai en minutes (optionnel)" min="1" max="1440">
    <button class="btn-primary" id="saveTask">Ajouter la tâche</button>
  `);
  
  $('#saveTask').addEventListener('click', () => saveTask(patientId));
}

async function saveTask(patientId) {
  const description = $('#taskDescription').value.trim();
  const minutes = parseInt($('#taskMinutes').value) || 0;
  
  if (!description) {
    alert('Veuillez saisir une description');
    return;
  }
  
  try {
    const { doc, getDoc, updateDoc } = window.firestoreFunctions;
    const patientRef = doc(db, 'users', currentUserId, 'patients', patientId);
    const patientSnap = await getDoc(patientRef);
    
    if (patientSnap.exists()) {
      const patientData = patientSnap.data();
      const task = {
        id: generateId('task'),
        description,
        dueAt: minutes > 0 ? new Date(Date.now() + minutes * 60000).toISOString() : null,
        completed: false,
        createdAt: new Date().toISOString()
      };
      
      const updatedTasks = [...(patientData.tasks || []), task];
      await updateDoc(patientRef, { tasks: updatedTasks });
    }
    
    $('.modal-overlay').remove();
    
  } catch (error) {
    console.error('Error adding task:', error);
    alert('Erreur lors de l\'ajout de la tâche');
  }
}

async function completeTask(patientId, taskId) {
  try {
    const { doc, getDoc, updateDoc } = window.firestoreFunctions;
    const patientRef = doc(db, 'users', currentUserId, 'patients', patientId);
    const patientSnap = await getDoc(patientRef);
    
    if (patientSnap.exists()) {
      const patientData = patientSnap.data();
      const updatedTasks = patientData.tasks.map(task => 
        task.id === taskId ? { ...task, completed: true } : task
      );
      await updateDoc(patientRef, { tasks: updatedTasks });
    }
    
  } catch (error) {
    console.error('Error completing task:', error);
  }
}

async function deleteTask(patientId, taskId) {
  if (!confirm('Êtes-vous sûr de vouloir supprimer cette tâche ?')) return;
  
  try {
    const { doc, getDoc, updateDoc } = window.firestoreFunctions;
    const patientRef = doc(db, 'users', currentUserId, 'patients', patientId);
    const patientSnap = await getDoc(patientRef);
    
    if (patientSnap.exists()) {
      const patientData = patientSnap.data();
      const updatedTasks = patientData.tasks.filter(task => task.id !== taskId);
      await updateDoc(patientRef, { tasks: updatedTasks });
    }
    
  } catch (error) {
    console.error('Error deleting task:', error);
  }
}

function editPatientInfo(patientId) {
  const modal = createModal('✏️ Modifier les informations', `
    <input id="editLocation" placeholder="📍 Localisation">
    <input id="editNurse" placeholder="📱 Numéro infirmière">
    <button class="btn-primary" id="saveInfo">Sauvegarder</button>
  `);
  
  // Load current values
  loadPatientInfo(patientId);
  
  $('#saveInfo').addEventListener('click', () => savePatientInfo(patientId));
}

async function loadPatientInfo(patientId) {
  try {
    const { doc, getDoc } = window.firestoreFunctions;
    const patientSnap = await getDoc(doc(db, 'users', currentUserId, 'patients', patientId));
    
    if (patientSnap.exists()) {
      const patient = patientSnap.data();
      $('#editLocation').value = patient.location || '';
      $('#editNurse').value = patient.nurse || '';
    }
  } catch (error) {
    console.error('Error loading patient info:', error);
  }
}

async function savePatientInfo(patientId) {
  const location = $('#editLocation').value.trim();
  const nurse = $('#editNurse').value.trim();
  
  try {
    const { doc, updateDoc } = window.firestoreFunctions;
    await updateDoc(doc(db, 'users', currentUserId, 'patients', patientId), {
      location,
      nurse
    });
    
    $('.modal-overlay').remove();
    
  } catch (error) {
    console.error('Error updating patient info:', error);
  }
}

function showDecisionMenu(patientId, buttonElement) {
  $$('.floating-menu').forEach(menu => menu.remove());
  
  const menu = document.createElement('div');
  menu.className = 'floating-menu';
  menu.innerHTML = `
    <button class="menu-item discharge" data-action="discharge" data-pid="${patientId}">
      🏠 Retour à domicile
    </button>
    <button class="menu-item hospitalize" data-action="hospitalize" data-pid="${patientId}">
      🏥 Hospitalisation
    </button>
    <button class="menu-item delete" data-action="delete" data-pid="${patientId}">
      🗑️ Supprimer le patient
    </button>
  `;
  
  buttonElement.closest('.card').appendChild(menu);
  
  setTimeout(() => {
    document.addEventListener('click', (e) => {
      if (!menu.contains(e.target) && !buttonElement.contains(e.target)) {
        menu.remove();
      }
    }, { once: true });
  }, 100);
}

async function handlePatientDecision(patientId, action) {
  try {
    const { doc, getDoc, deleteDoc } = window.firestoreFunctions;
    
    // Get patient data for time calculation
    const patientSnap = await getDoc(doc(db, 'users', currentUserId, 'patients', patientId));
    let timeSpent = 0;
    
    if (patientSnap.exists()) {
      const patient = patientSnap.data();
      const createdAt = new Date(patient.createdAt);
      const now = new Date();
      timeSpent = Math.floor((now - createdAt) / 60000); // minutes
    }
    
    await deleteDoc(doc(db, 'users', currentUserId, 'patients', patientId));
    
    const statMap = {
      'discharge': 'discharged',
      'hospitalize': 'hospitalized',
      'delete': 'deleted'
    };
    
    const statKey = statMap[action];
    await updateStats(statKey, 1);
    await updateDailyStats(statKey, 1);
    
    // Update time statistics if not deleted
    if (action !== 'delete') {
      await updateStats('totalTime', timeSpent);
      await updateStats('totalPatients', 1);
    }
    
    $$('.floating-menu').forEach(menu => menu.remove());
    
  } catch (error) {
    console.error('Error handling patient decision:', error);
  }
}

// Patient Transfer
function showTransferModal() {
  const modal = createModal('🔄 Relève - Transfert de patients', `
    <div class="transfer-section">
      <h3>Sélectionner les utilisateurs destinataires:</h3>
      <div id="userCheckboxes" class="user-checkbox-group"></div>
    </div>
    <div class="transfer-section">
      <h3>Sélectionner les patients à transférer:</h3>
      <div id="patientCheckboxes" class="patient-checkbox-group"></div>
    </div>
    <button class="btn-primary" id="transferPatients">Transférer</button>
  `);
  
  loadTransferUsers();
  loadTransferPatients();
  
  $('#transferPatients').addEventListener('click', executeTransfer);
}

async function loadTransferUsers() {
  try {
    const { collection, getDocs } = window.firestoreFunctions;
    const usersSnapshot = await getDocs(collection(db, 'users'));
    const container = $('#userCheckboxes');
    
    container.innerHTML = '';
    
    usersSnapshot.forEach(doc => {
      if (doc.id !== currentUserId) {
        const user = doc.data();
        const item = document.createElement('div');
        item.className = 'checkbox-item';
        item.innerHTML = `
          <input type="checkbox" id="user_${doc.id}" value="${doc.id}">
          <label for="user_${doc.id}">${user.name}</label>
        `;
        container.appendChild(item);
      }
    });
    
  } catch (error) {
    console.error('Error loading transfer users:', error);
  }
}

async function loadTransferPatients() {
  try {
    const { collection, getDocs } = window.firestoreFunctions;
    const patientsSnapshot = await getDocs(collection(db, 'users', currentUserId, 'patients'));
    const container = $('#patientCheckboxes');
    
    container.innerHTML = '';
    
    patientsSnapshot.forEach(doc => {
      const patient = doc.data();
      const item = document.createElement('div');
      item.className = 'checkbox-item';
      item.innerHTML = `
        <input type="checkbox" id="patient_${doc.id}" value="${doc.id}">
        <label for="patient_${doc.id}">${patient.name} - ${patient.complaint}</label>
      `;
      container.appendChild(item);
    });
    
  } catch (error) {
    console.error('Error loading transfer patients:', error);
  }
}

async function executeTransfer() {
  const selectedUsers = Array.from($$('#userCheckboxes input:checked')).map(cb => cb.value);
  const selectedPatients = Array.from($$('#patientCheckboxes input:checked')).map(cb => cb.value);
  
  if (selectedUsers.length === 0 || selectedPatients.length === 0) {
    alert('Veuillez sélectionner au moins un utilisateur et un patient');
    return;
  }
  
  try {
    const { doc, getDoc, setDoc, deleteDoc, writeBatch } = window.firestoreFunctions;
    const batch = writeBatch(db);
    
    for (const patientId of selectedPatients) {
      const patientSnap = await getDoc(doc(db, 'users', currentUserId, 'patients', patientId));
      
      if (patientSnap.exists()) {
        const patientData = patientSnap.data();
        
        // Transfer to each selected user
        for (const userId of selectedUsers) {
          const newPatientId = generateId('patient');
          const newPatientData = {
            ...patientData,
            id: newPatientId,
            userId: userId,
            transferredFrom: currentUserId,
            transferredAt: new Date().toISOString()
          };
          
          batch.set(doc(db, 'users', userId, 'patients', newPatientId), newPatientData);
        }
        
        // Delete from current user
        batch.delete(doc(db, 'users', currentUserId, 'patients', patientId));
      }
    }
    
    await batch.commit();
    
    $('.modal-overlay').remove();
    alert('Transfert effectué avec succès!');
    
  } catch (error) {
    console.error('Error transferring patients:', error);
    alert('Erreur lors du transfert');
  }
}

// Notes Management
function toggleNotesPanel() {
  const panel = $('#notesPanel');
  panel.classList.toggle('hidden');
}

function renderNotes(snapshot) {
  const container = $('#notesList');
  
  if (snapshot.empty) {
    container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 20px;">Aucune note</p>';
    return;
  }
  
  container.innerHTML = '';
  
  snapshot.forEach(doc => {
    const note = doc.data();
    const noteElement = document.createElement('div');
    noteElement.className = 'note-item';
    noteElement.innerHTML = `
      <div class="note-content">${note.content}</div>
      <div class="note-actions">
        <button class="note-edit" data-noteid="${doc.id}">✏️</button>
        <button class="note-delete" data-noteid="${doc.id}">🗑️</button>
      </div>
    `;
    container.appendChild(noteElement);
  });
}

function showAddNoteModal() {
  const modal = createModal('📝 Nouvelle note', `
    <textarea id="noteContent" placeholder="Écrivez votre note ici..." rows="4"></textarea>
    <button class="btn-primary" id="saveNote">Ajouter la note</button>
  `);
  
  $('#saveNote').addEventListener('click', saveNote);
}

async function saveNote() {
  const content = $('#noteContent').value.trim();
  
  if (!content) {
    alert('Veuillez saisir le contenu de la note');
    return;
  }
  
  try {
    const { doc, setDoc } = window.firestoreFunctions;
    const noteId = generateId('note');
    
    const noteData = {
      id: noteId,
      content,
      createdAt: new Date().toISOString(),
      userId: currentUserId
    };
    
    await setDoc(doc(db, 'users', currentUserId, 'notes', noteId), noteData);
    
    $('.modal-overlay').remove();
    
  } catch (error) {
    console.error('Error saving note:', error);
  }
}

async function editNote(noteId) {
  try {
    const { doc, getDoc } = window.firestoreFunctions;
    const noteSnap = await getDoc(doc(db, 'users', currentUserId, 'notes', noteId));
    
    if (noteSnap.exists()) {
      const note = noteSnap.data();
      
      const modal = createModal('✏️ Modifier la note', `
        <textarea id="editNoteContent" rows="4">${note.content}</textarea>
        <button class="btn-primary" id="updateNote">Mettre à jour</button>
      `);
      
      $('#updateNote').addEventListener('click', () => updateNote(noteId));
    }
    
  } catch (error) {
    console.error('Error loading note:', error);
  }
}

async function updateNote(noteId) {
  const content = $('#editNoteContent').value.trim();
  
  if (!content) {
    alert('Veuillez saisir le contenu de la note');
    return;
  }
  
  try {
    const { doc, updateDoc } = window.firestoreFunctions;
    await updateDoc(doc(db, 'users', currentUserId, 'notes', noteId), {
      content,
      updatedAt: new Date().toISOString()
    });
    
    $('.modal-overlay').remove();
    
  } catch (error) {
    console.error('Error updating note:', error);
  }
}

async function deleteNote(noteId) {
  if (!confirm('Êtes-vous sûr de vouloir supprimer cette note ?')) return;
  
  try {
    const { doc, deleteDoc } = window.firestoreFunctions;
    await deleteDoc(doc(db, 'users', currentUserId, 'notes', noteId));
    
  } catch (error) {
    console.error('Error deleting note:', error);
  }
}

// Profile Management
function showEditNameModal() {
  const modal = createModal('✏️ Modifier le nom', `
    <input id="newName" placeholder="Nouveau nom" value="${currentUser}">
    <button class="btn-primary" id="updateName">Mettre à jour</button>
  `);
  
  $('#updateName').addEventListener('click', updateUserName);
}

async function updateUserName() {
  const newName = $('#newName').value.trim();
  
  if (!newName) {
    alert('Veuillez saisir un nom');
    return;
  }
  
  try {
    const { doc, updateDoc } = window.firestoreFunctions;
    await updateDoc(doc(db, 'users', currentUserId), {
      name: newName,
      updatedAt: new Date().toISOString()
    });
    
    currentUser = newName;
    $('#username').textContent = newName;
    $('#profileName').textContent = newName;
    
    $('.modal-overlay').remove();
    alert('Nom mis à jour avec succès!');
    
  } catch (error) {
    console.error('Error updating name:', error);
  }
}

function showChangePinModal() {
  const modal = createModal('🔑 Changer le PIN', `
    <input type="password" id="currentPin" placeholder="PIN actuel" maxlength="4">
    <input type="password" id="newPin" placeholder="Nouveau PIN" maxlength="4">
    <input type="password" id="confirmNewPin" placeholder="Confirmer le nouveau PIN" maxlength="4">
    <button class="btn-primary" id="updatePin">Mettre à jour</button>
  `);
  
  // PIN input validation
  $$('#currentPin, #newPin, #confirmNewPin').forEach(input => {
    input.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/[^0-9]/g, '');
    });
  });
  
  $('#updatePin').addEventListener('click', updateUserPin);
}

async function updateUserPin() {
  const currentPin = $('#currentPin').value;
  const newPin = $('#newPin').value;
  const confirmPin = $('#confirmNewPin').value;
  
  if (!currentPin || !newPin || !confirmPin) {
    alert('Veuillez remplir tous les champs');
    return;
  }
  
  if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
    alert('Le nouveau PIN doit contenir 4 chiffres');
    return;
  }
  
  if (newPin !== confirmPin) {
    alert('Les nouveaux PINs ne correspondent pas');
    return;
  }
  
  try {
    const { doc, getDoc, updateDoc } = window.firestoreFunctions;
    const userSnap = await getDoc(doc(db, 'users', currentUserId));
    
    if (userSnap.exists()) {
      const userData = userSnap.data();
      
      if (userData.pin !== currentPin) {
        alert('PIN actuel incorrect');
        return;
      }
      
      await updateDoc(doc(db, 'users', currentUserId), {
        pin: newPin,
        updatedAt: new Date().toISOString()
      });
      
      $('.modal-overlay').remove();
      alert('PIN mis à jour avec succès!');
    }
    
  } catch (error) {
    console.error('Error updating PIN:', error);
  }
}

async function handleDeleteAccount() {
  if (!confirm('Êtes-vous sûr de vouloir supprimer votre compte ? Cette action est irréversible.')) return;
  
  const pin = prompt('Veuillez saisir votre PIN pour confirmer la suppression:');
  if (!pin) return;
  
  try {
    const { doc, getDoc, deleteDoc, collection, getDocs } = window.firestoreFunctions;
    
    // Verify PIN
    const userSnap = await getDoc(doc(db, 'users', currentUserId));
    if (!userSnap.exists() || userSnap.data().pin !== pin) {
      alert('PIN incorrect');
      return;
    }
    
    // Delete all user data
    const collections = ['patients', 'notes', 'stats', 'dailyStats'];
    
    for (const collectionName of collections) {
      const snapshot = await getDocs(collection(db, 'users', currentUserId, collectionName));
      const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
    }
    
    // Delete user document
    await deleteDoc(doc(db, 'users', currentUserId));
    
    alert('Compte supprimé avec succès');
    logout();
    
  } catch (error) {
    console.error('Error deleting account:', error);
    alert('Erreur lors de la suppression du compte');
  }
}

// Statistics
async function updateStats(field, value) {
  try {
    const { doc, updateDoc, increment, setDoc } = window.firestoreFunctions;
    const statsRef = doc(db, 'users', currentUserId, 'stats', 'main');
    
    try {
      await updateDoc(statsRef, {
        [field]: increment(value)
      });
    } catch (error) {
      const initialStats = {
        added: 0,
        hospitalized: 0,
        discharged: 0,
        deleted: 0,
        totalTime: 0,
        totalPatients: 0
      };
      initialStats[field] = value;
      await setDoc(statsRef, initialStats);
    }
  } catch (error) {
    console.error('Error updating stats:', error);
  }
}

function updateStatsDisplay(stats) {
  $('#sAdded').textContent = stats.added || 0;
  $('#sHosp').textContent = stats.hospitalized || 0;
  $('#sHome').textContent = stats.discharged || 0;
  $('#sDel').textContent = stats.deleted || 0;
  
  // Calculate average time
  const totalPatients = stats.totalPatients || 0;
  const totalTime = stats.totalTime || 0;
  const avgTime = totalPatients > 0 ? Math.round(totalTime / totalPatients) : 0;
  $('#sAvgTime').textContent = `${avgTime}m`;
}

async function updateDailyStats(field, value) {
  try {
    const { doc, updateDoc, increment, setDoc } = window.firestoreFunctions;
    const today = new Date().toISOString().split('T')[0];
    const dailyStatsRef = doc(db, 'users', currentUserId, 'dailyStats', today);
    
    try {
      await updateDoc(dailyStatsRef, {
        [field]: increment(value),
        date: today
      });
    } catch (error) {
      const initialStats = {
        date: today,
        added: 0,
        hospitalized: 0,
        discharged: 0,
        deleted: 0
      };
      initialStats[field] = value;
      await setDoc(dailyStatsRef, initialStats);
    }
  } catch (error) {
    console.error('Error updating daily stats:', error);
  }
}

async function loadDailyStats() {
  try {
    const { collection, getDocs, orderBy, query } = window.firestoreFunctions;
    const dailyStatsQuery = query(
      collection(db, 'users', currentUserId, 'dailyStats'),
      orderBy('date', 'desc')
    );
    
    const snapshot = await getDocs(dailyStatsQuery);
    const container = $('#dailyStatsContainer');
    
    if (snapshot.empty) {
      container.innerHTML = '<p style="text-align: center; color: var(--text-muted);">Aucune statistique journalière</p>';
      return;
    }
    
    container.innerHTML = '';
    
    snapshot.forEach(doc => {
      const stats = doc.data();
      const date = new Date(stats.date).toLocaleDateString('fr-FR');
      
      const statElement = document.createElement('div');
      statElement.className = 'daily-stat';
      statElement.innerHTML = `
        <div class="daily-stat-date">${date}</div>
        <div class="daily-stat-content">
          <div>Ajoutés: ${stats.added || 0}</div>
          <div>Hospitalisés: ${stats.hospitalized || 0}</div>
          <div>Sortis: ${stats.discharged || 0}</div>
          <div>Supprimés: ${stats.deleted || 0}</div>
        </div>
      `;
      container.appendChild(statElement);
    });
    
  } catch (error) {
    console.error('Error loading daily stats:', error);
  }
}

async function resetStats() {
  if (!confirm('Êtes-vous sûr de vouloir réinitialiser toutes les statistiques ?')) return;
  
  try {
    const { doc, setDoc, collection, getDocs } = window.firestoreFunctions;
    
    // Reset main stats
    await setDoc(doc(db, 'users', currentUserId, 'stats', 'main'), {
      added: 0,
      hospitalized: 0,
      discharged: 0,
      deleted: 0,
      totalTime: 0,
      totalPatients: 0
    });
    
    // Reset daily stats
    const dailyStatsSnapshot = await getDocs(collection(db, 'users', currentUserId, 'dailyStats'));
    const deletePromises = dailyStatsSnapshot.docs.map(doc => doc.ref.delete());
    await Promise.all(deletePromises);
    
    $('#dailyStatsContainer').innerHTML = '<p style="text-align: center; color: var(--text-muted);">Aucune statistique journalière</p>';
    
  } catch (error) {
    console.error('Error resetting stats:', error);
  }
}

// Utility functions
function generateId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function createModal(title, content) {
  // Remove existing modals
  $$('.modal-overlay').forEach(modal => modal.remove());
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2>${title}</h2>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-content">
        ${content}
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Close handlers
  modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
  
  return modal;
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

console.log('FastTrackers script loaded with enhanced features');
