// FastTrackers PWA with Firebase sync, live countdown timers, and offline capabilities
console.log('FastTrackers loading with Firebase sync and offline support...');

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
let db = null;
let unsubscribePatients = null;
let unsubscribeStats = null;
let app = null;
let updateTimerHandle = null;

// DOM helpers
function $(selector) {
  return document.querySelector(selector);
}

function $$(selector) {
  return document.querySelectorAll(selector);
}

// Enhanced Firebase initialization with offline capabilities
async function initializeFirebaseWithOffline() {
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
      enableIndexedDbPersistence
    } = await import('https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js');
    
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    
    // Enable offline persistence for your specific scenario
    try {
      await enableIndexedDbPersistence(db);
      console.log('Firebase offline persistence enabled');
    } catch (error) {
      console.warn('Offline persistence failed:', error);
    }
    
    window.firestoreFunctions = {
      collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, increment, getDoc
    };
    
    console.log('Firebase initialized with offline capabilities');
    return true;
  } catch (error) {
    console.error('Firebase initialization failed:', error);
    return false;
  }
}

// Initialize app
async function initializeApp() {
  console.log('Initializing FastTrackers...');
  
  const firebaseReady = await initializeFirebaseWithOffline();
  if (!firebaseReady) {
    console.error('Firebase failed to initialize');
  }
  
  setupLoginButtons();
  setupAppEventListeners();
  
  console.log('FastTrackers initialized successfully');
}

// Setup login buttons
function setupLoginButtons() {
  console.log('Setting up login buttons...');
  
  const loginButtons = $$('.user-btn');
  
  loginButtons.forEach((button) => {
    button.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      const username = this.dataset.user;
      console.log('Login button clicked:', username);
      if (username) {
        loginUser(username);
      }
    });
  });
}

// Login function
async function loginUser(username) {
  console.log('Logging in user:', username);
  
  try {
    currentUser = username;
    
    const usernameEl = $('#username');
    if (usernameEl) {
      usernameEl.textContent = username;
    }
    
    $('#login').classList.add('hidden');
    $('#app').classList.remove('hidden');
    
    if (db && window.firestoreFunctions) {
      await startFirebaseListeners();
    } else {
      console.warn('Firebase not available');
    }
    
    startLiveTimers(); // Start live countdown timers
    
    console.log('Login successful for:', username);
    
  } catch (error) {
    console.error('Login error:', error);
    alert('Erreur de connexion. Veuillez réessayer.');
  }
}

// Start Firebase real-time listeners
async function startFirebaseListeners() {
  console.log('Starting Firebase real-time listeners for:', currentUser);
  
  try {
    const { collection, doc, onSnapshot } = window.firestoreFunctions;
    
    const patientsCollection = collection(db, `users`, currentUser, 'patients');
    unsubscribePatients = onSnapshot(patientsCollection, (snapshot) => {
      console.log('Patients updated from Firebase');
      renderPatientsFromFirebase(snapshot);
    }, (error) => {
      console.error('Error listening to patients:', error);
    });
    
    const statsDoc = doc(db, `users`, currentUser, 'stats', 'main');
    unsubscribeStats = onSnapshot(statsDoc, (doc) => {
      console.log('Stats updated from Firebase');
      const stats = doc.exists() ? doc.data() : {};
      updateStatisticsDisplay(stats);
    }, (error) => {
      console.error('Error listening to stats:', error);
    });
    
  } catch (error) {
    console.error('Error setting up Firebase listeners:', error);
  }
}

// Live countdown timers
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

// Format time
function formatTime(ms) {
  if (ms <= 0) return '00:00';
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Render patients from Firebase snapshot
function renderPatientsFromFirebase(snapshot) {
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

// Create patient card HTML with editable info and completed tasks
function createPatientCardHTML(patient) {
  const allTasks = (patient.tasks || []);
  
  return `
    <div class="card ${patient.triage}" data-patient-id="${patient.id}">
      <div class="info-box editable" data-pid="${patient.id}">
        <div class="info-location">📍 <span class="editable-text">${patient.location || 'Cliquer pour modifier'}</span></div>
        <div class="info-nurse">📱 <span class="editable-text">${patient.nurse || 'Cliquer pour modifier'}</span></div>
      </div>
      <div class="patient-main">
        <h3 class="patient-name">${patient.name}</h3>
        <p class="patient-complaint">${patient.complaint}</p>
      </div>
      <div class="tasks">
        ${allTasks.map(task => `
          <div class="task ${task.completed ? 'completed' : ''}">
            <div class="task-content">
              <span class="task-desc">${task.description}</span>
              ${task.dueAt && !task.completed ? `<span class="task-timer" data-dueat="${task.dueAt}">${formatTime(new Date(task.dueAt) - Date.now())}</span>` : ''}
            </div>
            ${!task.completed ? `<button class="task-check" data-pid="${patient.id}" data-tid="${task.id}">✓</button>` : ''}
          </div>
        `).join('')}
      </div>
      <div class="actions">
        <button class="btn task" data-pid="${patient.id}">📋 Tâches</button>
        <button class="btn decision" data-pid="${patient.id}">⚖️ Décision</button>
      </div>
    </div>
  `;
}

// Setup other app event listeners - FIXED VERSION
function setupAppEventListeners() {
  const logoutBtn = $('#logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', logoutUser);
  }
  
  $$('.tab').forEach(tab => {
    tab.addEventListener('click', function() {
      switchTab(this.dataset.tab);
    });
  });
  
  const addPatientBtn = $('#addPatient');
  if (addPatientBtn) {
    addPatientBtn.addEventListener('click', showAddPatientModal);
  }
  
  const resetStatsBtn = $('#resetStats');
  if (resetStatsBtn) {
    resetStatsBtn.addEventListener('click', resetStatistics);
  }
  
  // Event delegation for dynamic elements - FIXED VERSION
  document.addEventListener('click', function(e) {
    // Prevent multiple event handling
    if (e.defaultPrevented) return;
    
    // Task buttons
    if (e.target.matches('.btn.task')) {
      e.preventDefault();
      e.stopPropagation();
      const patientId = e.target.dataset.pid;
      showAddTaskModal(patientId);
      return;
    }
    
    // Decision buttons
    if (e.target.matches('.btn.decision')) {
      e.preventDefault();
      e.stopPropagation();
      const patientId = e.target.dataset.pid;
      showDecisionMenu(patientId, e.target);
      return;
    }
    
    // Task completion
    if (e.target.matches('.task-check')) {
      e.preventDefault();
      e.stopPropagation();
      const patientId = e.target.dataset.pid;
      const taskId = e.target.dataset.tid;
      completeTask(patientId, taskId);
      return;
    }
    
    // Editable info boxes - FIXED: Only handle the main container
    if (e.target.matches('.info-box.editable') || e.target.closest('.info-box.editable')) {
      e.preventDefault();
      e.stopPropagation();
      const infoBox = e.target.matches('.info-box.editable') ? e.target : e.target.closest('.info-box.editable');
      const patientId = infoBox.dataset.pid;
      editPatientInfo(patientId);
      return;
    }
    
    // Menu items
    if (e.target.matches('.menu-item')) {
      e.preventDefault();
      e.stopPropagation();
      const patientId = e.target.dataset.pid;
      const action = e.target.dataset.action;
      handlePatientDecision(patientId, action);
      return;
    }
  });
}

// Logout function
function logoutUser() {
  console.log('Logging out user');
  
  if (unsubscribePatients) {
    unsubscribePatients();
    unsubscribePatients = null;
  }
  if (unsubscribeStats) {
    unsubscribeStats();
    unsubscribeStats = null;
  }
  
  stopLiveTimers(); // Stop live timers on logout
  
  currentUser = null;
  $('#login').classList.remove('hidden');
  $('#app').classList.add('hidden');
}

// Switch tabs
function switchTab(tabName) {
  $$('.tab').forEach(tab => tab.classList.remove('active'));
  $(`[data-tab="${tabName}"]`).classList.add('active');
  
  $$('.tab-content').forEach(content => content.classList.add('hidden'));
  $(`#${tabName}`).classList.remove('hidden');
}

// Show add patient modal
function showAddPatientModal() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2>➕ Nouveau patient</h2>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-content">
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
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Close handlers
  modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
  
  // Save patient
  $('#savePatient').addEventListener('click', saveNewPatient);
}

// Save new patient
async function saveNewPatient() {
  const name = $('#patientName').value.trim();
  const complaint = $('#patientComplaint').value.trim();
  const triage = $('#patientTriage').value;
  const location = $('#patientLocation').value.trim();
  const nurse = $('#patientNurse').value.trim();
  
  if (!name || !complaint || !triage) {
    alert('Veuillez remplir tous les champs obligatoires');
    return;
  }
  
  const patientId = 'patient_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  const patientData = {
    id: patientId,
    name,
    complaint,
    triage,
    location,
    nurse,
    tasks: [],
    createdAt: new Date().toISOString()
  };
  
  try {
    if (db && window.firestoreFunctions) {
      const { doc, setDoc } = window.firestoreFunctions;
      await setDoc(doc(db, `users`, currentUser, 'patients', patientId), patientData);
      await updateStats('added', 1);
    }
    
    $('.modal-overlay').remove();
    console.log('Patient added:', name);
    
  } catch (error) {
    console.error('Error adding patient:', error);
    alert('Erreur lors de l\'ajout du patient');
  }
}

// Show add task modal
function showAddTaskModal(patientId) {
  console.log('Showing task modal for patient:', patientId);
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2>📋 Nouvelle tâche</h2>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-content">
        <input id="taskDescription" placeholder="Description de la tâche *" required>
        <input id="taskMinutes" type="number" placeholder="⏰ Délai en minutes (optionnel)" min="1" max="1440">
        <button class="btn-primary" id="saveTask">Ajouter la tâche</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Close handlers
  modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
  
  // Save task
  $('#saveTask').addEventListener('click', () => saveNewTask(patientId));
}

// Save new task
async function saveNewTask(patientId) {
  const description = $('#taskDescription').value.trim();
  const minutes = parseInt($('#taskMinutes').value) || 0;
  
  if (!description) {
    alert('Veuillez saisir une description pour la tâche');
    return;
  }
  
  const task = {
    id: 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
    description,
    dueAt: minutes > 0 ? new Date(Date.now() + minutes * 60000).toISOString() : null,
    completed: false,
    createdAt: new Date().toISOString()
  };
  
  try {
    if (db && window.firestoreFunctions) {
      const { doc, getDoc, updateDoc } = window.firestoreFunctions;
      const patientRef = doc(db, `users`, currentUser, 'patients', patientId);
      const patientSnap = await getDoc(patientRef);
      
      if (patientSnap.exists()) {
        const patientData = patientSnap.data();
        const updatedTasks = [...(patientData.tasks || []), task];
        await updateDoc(patientRef, { tasks: updatedTasks });
      }
    }
    
    $('.modal-overlay').remove();
    console.log('Task added:', description);
    
  } catch (error) {
    console.error('Error adding task:', error);
    alert('Erreur lors de l\'ajout de la tâche');
  }
}

// Show decision menu
function showDecisionMenu(patientId, buttonElement) {
  console.log('Showing decision menu for patient:', patientId);
  
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

// Handle patient decision
async function handlePatientDecision(patientId, action) {
  console.log('Handling patient decision:', action, 'for patient:', patientId);
  
  try {
    if (db && window.firestoreFunctions) {
      const { doc, deleteDoc } = window.firestoreFunctions;
      await deleteDoc(doc(db, `users`, currentUser, 'patients', patientId));
      
      const statMap = {
        'discharge': 'discharged',
        'hospitalize': 'hospitalized',
        'delete': 'deleted'
      };
      
      await updateStats(statMap[action], 1);
    }
    
    $$('.floating-menu').forEach(menu => menu.remove());
    
    console.log(`Patient ${action} completed`);
    
  } catch (error) {
    console.error(`Error with ${action}:`, error);
    alert('Erreur lors du traitement du patient');
  }
}

// Complete task with enhanced animation
async function completeTask(patientId, taskId) {
  console.log('Completing task:', taskId, 'for patient:', patientId);
  
  try {
    if (db && window.firestoreFunctions) {
      const { doc, getDoc, updateDoc } = window.firestoreFunctions;
      const patientRef = doc(db, `users`, currentUser, 'patients', patientId);
      const patientSnap = await getDoc(patientRef);
      
      if (patientSnap.exists()) {
        const patientData = patientSnap.data();
        const updatedTasks = patientData.tasks.map(task => 
          task.id === taskId ? { ...task, completed: true } : task
        );
        await updateDoc(patientRef, { tasks: updatedTasks });
      }
    }
    
    console.log('Task completed');
    
  } catch (error) {
    console.error('Error completing task:', error);
    alert('Erreur lors de la completion de la tâche');
  }
}

// Edit patient info - FIXED VERSION
function editPatientInfo(patientId) {
  console.log('Edit patient info for:', patientId);
  
  // Remove any existing modals to prevent duplicates
  const existingModals = document.querySelectorAll('.modal-overlay');
  existingModals.forEach(modal => modal.remove());
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2>✏️ Modifier les informations</h2>
        <button class="modal-close">&times;</button>
      </div>
      <div class="modal-content">
        <input id="editLocation" placeholder="📍 Localisation">
        <input id="editNurse" placeholder="📱 Numéro infirmière">
        <button class="btn-primary" id="saveInfo">Sauvegarder</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Load current values
  if (db && window.firestoreFunctions) {
    const { doc, getDoc } = window.firestoreFunctions;
    getDoc(doc(db, `users`, currentUser, 'patients', patientId)).then(docSnap => {
      if (docSnap.exists()) {
        const patient = docSnap.data();
        const locationInput = document.getElementById('editLocation');
        const nurseInput = document.getElementById('editNurse');
        if (locationInput) locationInput.value = patient.location || '';
        if (nurseInput) nurseInput.value = patient.nurse || '';
      }
    });
  }
  
  // Close handlers
  modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
  
  // Save info handler
  const saveBtn = document.getElementById('saveInfo');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => savePatientInfo(patientId));
  }
}

// Save patient info
async function savePatientInfo(patientId) {
  const location = $('#editLocation').value.trim();
  const nurse = $('#editNurse').value.trim();
  
  try {
    if (db && window.firestoreFunctions) {
      const { doc, updateDoc } = window.firestoreFunctions;
      await updateDoc(doc(db, `users`, currentUser, 'patients', patientId), {
        location, nurse
      });
    }
    
    $('.modal-overlay').remove();
    console.log('Patient info updated');
    
  } catch (error) {
    console.error('Error updating patient info:', error);
    alert('Erreur lors de la mise à jour');
  }
}

// Update statistics
async function updateStats(field, value) {
  try {
    if (db && window.firestoreFunctions) {
      const { doc, updateDoc, increment, setDoc } = window.firestoreFunctions;
      const statsRef = doc(db, `users`, currentUser, 'stats', 'main');
      
      try {
        await updateDoc(statsRef, {
          [field]: increment(value)
        });
      } catch (error) {
        const initialStats = { added: 0, hospitalized: 0, discharged: 0, deleted: 0 };
        initialStats[field] = value;
        await setDoc(statsRef, initialStats);
      }
    }
  } catch (error) {
    console.error('Error updating stats:', error);
  }
}

// Update statistics display
function updateStatisticsDisplay(stats) {
  $('#sAdded').textContent = stats.added || 0;
  $('#sHosp').textContent = stats.hospitalized || 0;
  $('#sHome').textContent = stats.discharged || 0;
  $('#sDel').textContent = stats.deleted || 0;
}

// Reset statistics
async function resetStatistics() {
  if (!confirm('Êtes-vous sûr de vouloir réinitialiser toutes les statistiques ?')) {
    return;
  }
  
  try {
    if (db && window.firestoreFunctions) {
      const { doc, setDoc } = window.firestoreFunctions;
      const statsRef = doc(db, `users`, currentUser, 'stats', 'main');
      await setDoc(statsRef, {
        added: 0,
        hospitalized: 0,
        discharged: 0,
        deleted: 0
      });
    }
    
    console.log('Statistics reset');
    
  } catch (error) {
    console.error('Error resetting statistics:', error);
    alert('Erreur lors de la réinitialisation');
  }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

window.addEventListener('load', initializeApp);

console.log('FastTrackers script loaded with Firebase sync and offline support');
