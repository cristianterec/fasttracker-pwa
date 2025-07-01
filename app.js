// FastTrackers PWA with Firebase real-time sync and working buttons
console.log('FastTrackers loading with Firebase sync...');

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

// DOM helpers
function $(selector) {
  return document.querySelector(selector);
}

function $$(selector) {
  return document.querySelectorAll(selector);
}

// Initialize Firebase and app
async function initializeFirebase() {
  try {
    // Load Firebase SDK dynamically
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
      getDoc 
    } = await import('https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js');
    
    // Initialize Firebase
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    
    // Store Firestore functions globally for use throughout the app
    window.firestoreFunctions = {
      collection,
      doc,
      setDoc,
      updateDoc,
      deleteDoc,
      onSnapshot,
      increment,
      getDoc
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
  
  // Initialize Firebase first
  const firebaseReady = await initializeFirebase();
  if (!firebaseReady) {
    console.error('Firebase failed to initialize, falling back to localStorage');
  }
  
  // Setup login buttons
  setupLoginButtons();
  
  // Setup other event listeners
  setupAppEventListeners();
  
  console.log('FastTrackers initialized successfully');
}

// Setup login buttons with multiple approaches
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
  
  // Backup event delegation
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

// Login function with Firebase real-time setup
async function loginUser(username) {
  console.log('Logging in user:', username);
  
  try {
    currentUser = username;
    
    // Update UI
    const usernameEl = $('#username');
    if (usernameEl) {
      usernameEl.textContent = username;
    }
    
    // Hide login screen
    $('#login').classList.add('hidden');
    
    // Show app
    $('#app').classList.remove('hidden');
    
    // Start real-time Firebase listeners if available
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
    
    // Listen to patients collection
    const patientsCollection = collection(db, `users`, currentUser, 'patients');
    unsubscribePatients = onSnapshot(patientsCollection, (snapshot) => {
      console.log('Patients updated from Firebase');
      renderPatientsFromFirebase(snapshot);
    }, (error) => {
      console.error('Error listening to patients:', error);
    });
    
    // Listen to statistics document
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
  
  // Sort by triage priority (red=1, orange=2, etc.)
  const triagePriority = { red: 1, orange: 2, yellow: 3, green: 4, blue: 5, purple: 6 };
  patients.sort((a, b) => (triagePriority[a.triage] || 6) - (triagePriority[b.triage] || 6));
  
  grid.innerHTML = patients.map(patient => createPatientCardHTML(patient)).join('');
  
  // Attach event listeners to action buttons
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
  
  // Task buttons
  $$('.btn.task').forEach(btn => {
    btn.replaceWith(btn.cloneNode(true)); // Remove existing listeners
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
  
  // Decision buttons
  $$('.btn.decision').forEach(btn => {
    btn.replaceWith(btn.cloneNode(true)); // Remove existing listeners
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
  // Logout button
  const logoutBtn = $('#logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', logoutUser);
  }
  
  // Tab switching
  $$('.tab').forEach(tab => {
    tab.addEventListener('click', function() {
      switchTab(this.dataset.tab);
    });
  });
  
  // Add patient button
  const addPatientBtn = $('#addPatient');
  if (addPatientBtn) {
    addPatientBtn.addEventListener('click', showAddPatientModal);
  }
  
  // Reset stats button
  const resetStatsBtn = $('#resetStats');
  if (resetStatsBtn) {
    resetStatsBtn.addEventListener('click', resetStatistics);
  }
}

// Logout function
function logoutUser() {
  console.log('Logging out user');
  
  // Unsubscribe from Firebase listeners
  if (unsubscribePatients) {
    unsubscribePatients();
    unsubscribePatients = null;
  }
  if (unsubscribeStats) {
    unsubscribeStats();
    unsubscribeStats = null;
  }
  
  currentUser = null;
  
  // Show login screen
  $('#login').classList.remove('hidden');
  
  // Hide app
  $('#app').classList.add('hidden');
}

// Switch tabs
function switchTab(tabName) {
  $$('.tab').forEach(tab => tab.classList.remove('active'));
  $(`[data-tab="${tabName}"]`).classList.add('active');
  
  $$('.tab-content').forEach(content => content.classList.add('hidden'));
  $(`#${tabName}`).classList.remove('hidden');
  
  if (tabName === 'stats') {
    // Stats will be updated via Firebase listener
  }
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
        <button class="btn-primary" onclick="saveNewPatient()">Enregistrer</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Close handlers
  modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

// Save new patient to Firebase
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
      await incrementStatistic('added');
    } else {
      // Fallback to localStorage
      saveToLocalStorage('patient', patientData);
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
        <button class="btn-primary" onclick="saveNewTask('${patientId}')">Ajouter la tâche</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Close handlers
  modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
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
    patientId,
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
  
  // Remove existing menus
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
  
  // Close menu when clicking outside
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
      
      // Update statistics
      const statMap = {
        'discharge': 'discharged',
        'hospitalize': 'hospitalized',
        'delete': 'deleted'
      };
      await incrementStatistic(statMap[action]);
    }
    
    // Remove floating menu
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

// Edit patient info
function editPatientInfo(patientId) {
  console.log('Edit patient info for:', patientId);
  // Implementation for editing patient info modal
  // This can be added based on your requirements
}

// Increment statistic
async function incrementStatistic(statName) {
  try {
    if (db && window.firestoreFunctions) {
      const { doc, updateDoc, increment, setDoc, getDoc } = window.firestoreFunctions;
      const statsRef = doc(db, `users`, currentUser, 'stats', 'main');
      
      try {
        await updateDoc(statsRef, {
          [statName]: increment(1)
        });
      } catch (error) {
        // Document doesn't exist, create it
        const initialStats = {
          added: 0,
          hospitalized: 0,
          discharged: 0,
          deleted: 0
        };
        initialStats[statName] = 1;
        await setDoc(statsRef, initialStats);
      }
    }
  } catch (error) {
    console.error('Error updating statistics:', error);
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

// Fallback functions for localStorage
function loadLocalData() {
  // Implementation for localStorage fallback
  console.log('Loading local data as fallback');
}

function saveToLocalStorage(type, data) {
  // Implementation for localStorage fallback
  console.log('Saving to localStorage as fallback:', type, data);
}

// Make functions globally available
window.saveNewPatient = saveNewPatient;
window.saveNewTask = saveNewTask;
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

// Backup initialization
window.addEventListener('load', initializeApp);

console.log('FastTrackers script loaded with Firebase sync');
