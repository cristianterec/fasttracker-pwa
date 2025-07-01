// FastTrackers PWA with Firebase sync and offline capabilities
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
let patients = {};
let offlineManager = null;

// DOM helpers
function $(selector) {
  return document.querySelector(selector);
}

function $$(selector) {
  return document.querySelectorAll(selector);
}

// Offline Manager Class
class OfflineManager {
  constructor() {
    this.isOnline = navigator.onLine;
    this.operationQueue = [];
    this.db = null;
    this.setupEventListeners();
    this.initializeIndexedDB();
  }
  
  async initializeIndexedDB() {
    try {
      this.db = await this.openDB();
      console.log('IndexedDB initialized for offline storage');
    } catch (error) {
      console.error('IndexedDB initialization failed:', error);
    }
  }
  
  openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('FastTrackersOfflineDB', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        if (!db.objectStoreNames.contains('offlinePatients')) {
          const store = db.createObjectStore('offlinePatients', { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('user', 'user', { unique: false });
        }
        
        if (!db.objectStoreNames.contains('offlineTasks')) {
          const store = db.createObjectStore('offlineTasks', { keyPath: 'id' });
          store.createIndex('patientId', 'patientId', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
        
        if (!db.objectStoreNames.contains('offlineStats')) {
          const store = db.createObjectStore('offlineStats', { keyPath: 'id' });
          store.createIndex('user', 'user', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
        
        if (!db.objectStoreNames.contains('operationQueue')) {
          const store = db.createObjectStore('operationQueue', { keyPath: 'id' });
          store.createIndex('priority', 'priority', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }
  
  setupEventListeners() {
    window.addEventListener('online', () => {
      console.log('Connection restored - starting sync');
      this.isOnline = true;
      this.showConnectionStatus(true);
      this.processOfflineQueue();
    });
    
    window.addEventListener('offline', () => {
      console.log('Connection lost - switching to offline mode');
      this.isOnline = false;
      this.showConnectionStatus(false);
    });
  }
  
  showConnectionStatus(isOnline) {
    let statusIndicator = document.getElementById('connection-status');
    
    if (!statusIndicator) {
      statusIndicator = document.createElement('div');
      statusIndicator.id = 'connection-status';
      statusIndicator.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 8px 16px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        z-index: 1000;
        transition: all 0.3s ease;
      `;
      document.body.appendChild(statusIndicator);
    }
    
    if (isOnline) {
      statusIndicator.textContent = '🟢 En ligne';
      statusIndicator.style.background = 'rgba(16, 185, 129, 0.9)';
      statusIndicator.style.color = 'white';
      setTimeout(() => {
        statusIndicator.style.opacity = '0';
        setTimeout(() => statusIndicator.remove(), 300);
      }, 3000);
    } else {
      statusIndicator.textContent = '🔴 Hors ligne';
      statusIndicator.style.background = 'rgba(239, 68, 68, 0.9)';
      statusIndicator.style.color = 'white';
      statusIndicator.style.opacity = '1';
    }
  }
  
  async queueOperation(operation) {
    if (this.isOnline) {
      return await this.executeOperation(operation);
    } else {
      await this.addToQueue(operation);
      return { success: true, queued: true };
    }
  }
  
  async addToQueue(operation) {
    if (!this.db) {
      await this.initializeIndexedDB();
    }
    
    const tx = this.db.transaction(['operationQueue'], 'readwrite');
    const store = tx.objectStore('operationQueue');
    
    const queueItem = {
      id: 'op_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      ...operation,
      timestamp: Date.now(),
      retryCount: 0,
      maxRetries: 3
    };
    
    await store.add(queueItem);
    
    if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
      const registration = await navigator.serviceWorker.ready;
      await registration.sync.register(`${operation.type}-sync`);
    }
  }
  
  async processOfflineQueue() {
    if (!this.db) return;
    
    const tx = this.db.transaction(['operationQueue'], 'readwrite');
    const store = tx.objectStore('operationQueue');
    const operations = await store.getAll();
    
    for (const operation of operations) {
      try {
        await this.executeOperation(operation);
        await store.delete(operation.id);
        console.log('Successfully synced queued operation:', operation.type);
      } catch (error) {
        console.error('Failed to sync operation:', error);
        
        operation.retryCount++;
        if (operation.retryCount < operation.maxRetries) {
          await store.put(operation);
        } else {
          console.error('Max retries reached for operation:', operation.id);
          await store.delete(operation.id);
        }
      }
    }
  }
  
  async executeOperation(operation) {
    switch (operation.type) {
      case 'ADD_PATIENT':
        return await this.syncPatientToFirebase(operation.data);
      case 'UPDATE_PATIENT':
        return await this.updatePatientInFirebase(operation.data);
      case 'DELETE_PATIENT':
        return await this.deletePatientFromFirebase(operation.data);
      case 'ADD_TASK':
        return await this.syncTaskToFirebase(operation.data);
      case 'COMPLETE_TASK':
        return await this.completeTaskInFirebase(operation.data);
      case 'UPDATE_STATS':
        return await this.updateStatsInFirebase(operation.data);
      default:
        throw new Error(`Unknown operation type: ${operation.type}`);
    }
  }
  
  async syncPatientToFirebase(patientData) {
    if (!db || !window.firestoreFunctions) {
      throw new Error('Firebase not available');
    }
    
    const { doc, setDoc } = window.firestoreFunctions;
    await setDoc(doc(db, `users`, currentUser, 'patients', patientData.id), patientData);
  }
  
  async updatePatientInFirebase(updateData) {
    if (!db || !window.firestoreFunctions) {
      throw new Error('Firebase not available');
    }
    
    const { doc, updateDoc } = window.firestoreFunctions;
    await updateDoc(doc(db, `users`, currentUser, 'patients', updateData.id), updateData.changes);
  }
  
  async deletePatientFromFirebase(patientData) {
    if (!db || !window.firestoreFunctions) {
      throw new Error('Firebase not available');
    }
    
    const { doc, deleteDoc } = window.firestoreFunctions;
    await deleteDoc(doc(db, `users`, currentUser, 'patients', patientData.id));
  }
  
  async syncTaskToFirebase(taskData) {
    if (!db || !window.firestoreFunctions) {
      throw new Error('Firebase not available');
    }
    
    const { doc, getDoc, updateDoc } = window.firestoreFunctions;
    const patientRef = doc(db, `users`, currentUser, 'patients', taskData.patientId);
    const patientSnap = await getDoc(patientRef);
    
    if (patientSnap.exists()) {
      const patientData = patientSnap.data();
      const updatedTasks = [...(patientData.tasks || []), taskData.task];
      await updateDoc(patientRef, { tasks: updatedTasks });
    }
  }
  
  async completeTaskInFirebase(taskData) {
    if (!db || !window.firestoreFunctions) {
      throw new Error('Firebase not available');
    }
    
    const { doc, getDoc, updateDoc } = window.firestoreFunctions;
    const patientRef = doc(db, `users`, currentUser, 'patients', taskData.patientId);
    const patientSnap = await getDoc(patientRef);
    
    if (patientSnap.exists()) {
      const patientData = patientSnap.data();
      const updatedTasks = patientData.tasks.map(task => 
        task.id === taskData.taskId ? { ...task, completed: true } : task
      );
      await updateDoc(patientRef, { tasks: updatedTasks });
    }
  }
  
  async updateStatsInFirebase(statsData) {
    if (!db || !window.firestoreFunctions) {
      throw new Error('Firebase not available');
    }
    
    const { doc, updateDoc, increment, setDoc } = window.firestoreFunctions;
    const statsRef = doc(db, `users`, currentUser, 'stats', 'main');
    
    try {
      await updateDoc(statsRef, {
        [statsData.field]: increment(statsData.value)
      });
    } catch (error) {
      const initialStats = { added: 0, hospitalized: 0, discharged: 0, deleted: 0 };
      initialStats[statsData.field] = statsData.value;
      await setDoc(statsRef, initialStats);
    }
  }
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
      enableNetwork,
      disableNetwork
    } = await import('https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js');
    
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    
    try {
      await enableNetwork(db);
      console.log('Firebase offline persistence enabled');
    } catch (error) {
      console.warn('Offline persistence failed:', error);
    }
    
    window.firestoreFunctions = {
      collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, increment, getDoc,
      enableNetwork, disableNetwork
    };
    
    initializeOfflineManager();
    
    console.log('Firebase initialized with offline capabilities');
    return true;
  } catch (error) {
    console.error('Firebase initialization failed:', error);
    return false;
  }
}

function initializeOfflineManager() {
  offlineManager = new OfflineManager();
  window.offlineManager = offlineManager;
}

// Initialize app
async function initializeApp() {
  console.log('Initializing FastTrackers...');
  
  const firebaseReady = await initializeFirebaseWithOffline();
  if (!firebaseReady) {
    console.error('Firebase failed to initialize, falling back to localStorage');
  }
  
  setupLoginButtons();
  setupAppEventListeners();
  
  console.log('FastTrackers initialized successfully');
}

// Setup login buttons
function setupLoginButtons() {
  console.log('Setting up login buttons...');
  
  const loginButtons = $$('.user-btn');
  console.log('Found login buttons:', loginButtons.length);
  
  loginButtons.forEach((button, index) => {
    button.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      const username = e.target.dataset.user || e.currentTarget.dataset.user;
      console.log('Login button clicked:', username);
      if (username) {
        loginUser(username);
      }
    });
  });
  
  const loginScreen = $('#login');
  if (loginScreen) {
    loginScreen.addEventListener('click', function(e) {
      if (e.target.classList.contains('user-btn') || e.target.closest('.user-btn')) {
        const button = e.target.classList.contains('user-btn') ? e.target : e.target.closest('.user-btn');
        const username = button.dataset.user;
        if (username) {
          loginUser(username);
        }
      }
    });
  }
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
      console.warn('Firebase not available, using localStorage fallback');
      loadLocalData();
    }
    
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
  
  attachActionButtonListeners();
}

// Create patient card HTML
function createPatientCardHTML(patient) {
  const activeTasks = (patient.tasks || []).filter(task => !task.completed);
  
  return `
    <div class="card ${patient.triage}" data-patient-id="${patient.id}">
      <div class="info-box" onclick="editPatientInfo('${patient.id}')">
        📍 ${patient.location || '--'}<br/>📱 ${patient.nurse || '--'}
      </div>
      <div class="patient-main">
        <h3 class="patient-name">${patient.name}</h3>
        <p class="patient-complaint">${patient.complaint}</p>
      </div>
      <div class="tasks">
        ${activeTasks.map(task => `
          <div class="task">
            <div class="task-content">
              <span class="task-desc">${task.description}</span>
              <span class="task-timer">${task.dueAt ? formatTime(new Date(task.dueAt) - Date.now()) : '--:--'}</span>
            </div>
            <button class="task-check" onclick="completeTask('${patient.id}', '${task.id}')">✓</button>
          </div>
        `).join('')}
      </div>
      <div class="actions">
        <button class="btn task" data-patient-id="${patient.id}">📋 Tâches</button>
        <button class="btn decision" data-patient-id="${patient.id}">⚖️ Décision</button>
      </div>
    </div>
  `;
}

// Attach event listeners to action buttons
function attachActionButtonListeners() {
  console.log('Attaching action button listeners...');
  
  $$('.btn.task').forEach(btn => {
    btn.replaceWith(btn.cloneNode(true));
  });
  
  $$('.btn.task').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      const patientId = this.dataset.patientId;
      console.log('Task button clicked for patient:', patientId);
      showAddTaskModal(patientId);
    });
  });
  
  $$('.btn.decision').forEach(btn => {
    btn.replaceWith(btn.cloneNode(true));
  });
  
  $$('.btn.decision').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      const patientId = this.dataset.patientId;
      console.log('Decision button clicked for patient:', patientId);
      showDecisionMenu(patientId, this);
    });
  });
  
  console.log('Action button listeners attached');
}

// Setup other app event listeners
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

// Format time
function formatTime(ms) {
  if (ms <= 0) return '00:00';
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
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
        <button class="btn-primary" onclick="saveNewPatientWithOffline()">Enregistrer</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

// Save new patient with offline support
async function saveNewPatientWithOffline() {
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
    createdAt: new Date().toISOString(),
    user: currentUser,
    synced: false
  };
  
  try {
    await offlineManager.queueOperation({
      type: 'ADD_PATIENT',
      data: patientData,
      priority: 'high'
    });
    
    await offlineManager.queueOperation({
      type: 'UPDATE_STATS',
      data: { field: 'added', value: 1 },
      priority: 'low'
    });
    
    $('.modal-overlay').remove();
    console.log('Patient added (offline/online):', name);
    
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
        <button class="btn-primary" onclick="saveNewTaskWithOffline('${patientId}')">Ajouter la tâche</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

// Save new task with offline support
async function saveNewTaskWithOffline(patientId) {
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
    patientId,
    createdAt: new Date().toISOString(),
    user: currentUser,
    synced: false
  };
  
  try {
    await offlineManager.queueOperation({
      type: 'ADD_TASK',
      data: { patientId, task },
      priority: 'medium'
    });
    
    $('.modal-overlay').remove();
    console.log('Task added (offline/online):', description);
    
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
    <button class="menu-item discharge" onclick="handlePatientDecision('${patientId}', 'discharge')">
      🏠 Retour à domicile
    </button>
    <button class="menu-item hospitalize" onclick="handlePatientDecision('${patientId}', 'hospitalize')">
      🏥 Hospitalisation
    </button>
    <button class="menu-item delete" onclick="handlePatientDecision('${patientId}', 'delete')">
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
    await offlineManager.queueOperation({
      type: 'DELETE_PATIENT',
      data: { id: patientId },
      priority: 'high'
    });
    
    const statMap = {
      'discharge': 'discharged',
      'hospitalize': 'hospitalized',
      'delete': 'deleted'
    };
    
    await offlineManager.queueOperation({
      type: 'UPDATE_STATS',
      data: { field: statMap[action], value: 1 },
      priority: 'low'
    });
    
    $$('.floating-menu').forEach(menu => menu.remove());
    
    console.log(`Patient ${action} completed`);
    
  } catch (error) {
    console.error(`Error with ${action}:`, error);
    alert('Erreur lors du traitement du patient');
  }
}

// Complete task
async function completeTask(patientId, taskId) {
  console.log('Completing task:', taskId, 'for patient:', patientId);
  
  try {
    await offlineManager.queueOperation({
      type: 'COMPLETE_TASK',
      data: { patientId, taskId },
      priority: 'medium'
    });
    
    console.log('Task completed');
    
  } catch (error) {
    console.error('Error completing task:', error);
    alert('Erreur lors de la completion de la tâche');
  }
}

// Edit patient info
function editPatientInfo(patientId) {
  console.log('Edit patient info for:', patientId);
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

function loadLocalData() {
  console.log('Loading local data as fallback');
}

// Make functions globally available
window.saveNewPatientWithOffline = saveNewPatientWithOffline;
window.saveNewTaskWithOffline = saveNewTaskWithOffline;
window.showAddTaskModal = showAddTaskModal;
window.showDecisionMenu = showDecisionMenu;
window.handlePatientDecision = handlePatientDecision;
window.completeTask = completeTask;
window.editPatientInfo = editPatientInfo;

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

window.addEventListener('load', initializeApp);

console.log('FastTrackers script loaded with Firebase sync and offline support');
