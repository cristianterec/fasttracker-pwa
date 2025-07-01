// FastTrackers - Simplified working version without module imports
console.log('FastTrackers script loading...');

// Use Firebase v8 compat syntax for reliability
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
let patients = {};
let statistics = {};

// DOM helper functions
function $(selector) {
  return document.querySelector(selector);
}

function $$(selector) {
  return document.querySelectorAll(selector);
}

// Initialize when DOM and script are ready
function initializeApp() {
  console.log('Initializing FastTrackers...');
  
  // Setup login buttons with multiple approaches for reliability
  setupLoginButtons();
  
  // Setup other event listeners
  setupAppEventListeners();
  
  console.log('FastTrackers initialized successfully');
}

// Multiple approaches to ensure login buttons work
function setupLoginButtons() {
  console.log('Setting up login buttons...');
  
  // Approach 1: Direct event listeners
  const loginButtons = $$('.user-btn');
  console.log('Found login buttons:', loginButtons.length);
  
  loginButtons.forEach((button, index) => {
    console.log(`Setting up button ${index}:`, button.dataset.user);
    
    // Remove any existing listeners
    button.replaceWith(button.cloneNode(true));
    const newButton = $$('.user-btn')[index];
    
    newButton.addEventListener('click', function(e) {
      console.log('Login button clicked:', e.target.dataset.user);
      const username = e.target.dataset.user;
      if (username) {
        loginUser(username);
      }
    });
    
    // Backup approach: onclick handler
    newButton.onclick = function(e) {
      console.log('Onclick handler triggered:', e.target.dataset.user);
      const username = e.target.dataset.user;
      if (username) {
        loginUser(username);
      }
    };
  });
  
  // Approach 2: Event delegation on parent
  const loginScreen = $('#login');
  if (loginScreen) {
    loginScreen.addEventListener('click', function(e) {
      if (e.target.classList.contains('user-btn')) {
        console.log('Delegated click handler:', e.target.dataset.user);
        const username = e.target.dataset.user;
        if (username) {
          loginUser(username);
        }
      }
    });
  }
  
  console.log('Login buttons setup complete');
}

// Login function
function loginUser(username) {
  console.log('Logging in user:', username);
  
  try {
    currentUser = username;
    
    // Update UI
    const usernameEl = $('#username');
    if (usernameEl) {
      usernameEl.textContent = username;
    }
    
    // Hide login screen
    const loginScreen = $('#login');
    if (loginScreen) {
      loginScreen.classList.add('hidden');
    }
    
    // Show app
    const appContainer = $('#app');
    if (appContainer) {
      appContainer.classList.remove('hidden');
    }
    
    // Initialize user data
    initializeUserData();
    
    // Load initial data
    loadUserData();
    
    console.log('Login successful for:', username);
    
  } catch (error) {
    console.error('Login error:', error);
    alert('Erreur de connexion. Veuillez réessayer.');
  }
}

// Initialize user data structure
function initializeUserData() {
  if (!patients[currentUser]) {
    patients[currentUser] = [];
  }
  if (!statistics[currentUser]) {
    statistics[currentUser] = {
      added: 0,
      hospitalized: 0,
      discharged: 0,
      deleted: 0
    };
  }
}

// Load user data from localStorage
function loadUserData() {
  try {
    const savedPatients = localStorage.getItem(`ft_patients_${currentUser}`);
    const savedStats = localStorage.getItem(`ft_stats_${currentUser}`);
    
    if (savedPatients) {
      patients[currentUser] = JSON.parse(savedPatients);
    }
    
    if (savedStats) {
      statistics[currentUser] = JSON.parse(savedStats);
    }
    
    renderPatients();
    updateStatistics();
    
  } catch (error) {
    console.error('Error loading user data:', error);
  }
}

// Save user data to localStorage
function saveUserData() {
  try {
    localStorage.setItem(`ft_patients_${currentUser}`, JSON.stringify(patients[currentUser] || []));
    localStorage.setItem(`ft_stats_${currentUser}`, JSON.stringify(statistics[currentUser] || {}));
  } catch (error) {
    console.error('Error saving user data:', error);
  }
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
  
  currentUser = null;
  
  // Show login screen
  $('#login').classList.remove('hidden');
  
  // Hide app
  $('#app').classList.add('hidden');
}

// Switch tabs
function switchTab(tabName) {
  // Update tab buttons
  $$('.tab').forEach(tab => {
    tab.classList.remove('active');
  });
  $(`[data-tab="${tabName}"]`).classList.add('active');
  
  // Update tab content
  $$('.tab-content').forEach(content => {
    content.classList.add('hidden');
  });
  $(`#${tabName}`).classList.remove('hidden');
  
  if (tabName === 'stats') {
    updateStatistics();
  }
}

// Render patients
function renderPatients() {
  const grid = $('#grid');
  const userPatients = patients[currentUser] || [];
  
  if (userPatients.length === 0) {
    grid.innerHTML = '<p style="opacity:0.6; text-align:center; padding:40px;">Aucun patient actif</p>';
    return;
  }
  
  grid.innerHTML = userPatients.map(patient => `
    <div class="card ${patient.triage}">
      <div class="info-box" onclick="editPatientInfo('${patient.id}')">
        📍 ${patient.location || '--'}<br/>📱 ${patient.nurse || '--'}
      </div>
      <div class="patient-main">
        <h3 class="patient-name">${patient.name}</h3>
        <p class="patient-complaint">${patient.complaint}</p>
      </div>
      <div class="tasks">${renderTasks(patient.tasks || [])}</div>
      <div class="actions">
        <button class="btn task" onclick="showAddTaskModal('${patient.id}')">📋 Tâches</button>
        <button class="btn decision" onclick="showDecisionMenu('${patient.id}', this)">⚖️ Décision</button>
      </div>
    </div>
  `).join('');
}

// Render tasks
function renderTasks(tasks) {
  const activeTasks = tasks.filter(task => !task.completed);
  if (activeTasks.length === 0) return '';
  
  return activeTasks.map(task => `
    <div class="task">
      <div class="task-content">
        <span class="task-desc">${task.description}</span>
        <span class="task-timer">${task.dueAt ? formatTime(new Date(task.dueAt) - Date.now()) : '--:--'}</span>
      </div>
      <button class="task-check" onclick="completeTask('${task.patientId}', '${task.id}')">✓</button>
    </div>
  `).join('');
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
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
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
        <button onclick="saveNewPatient()" class="btn-primary">Enregistrer</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Close on overlay click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

// Save new patient
function saveNewPatient() {
  const name = $('#patientName').value.trim();
  const complaint = $('#patientComplaint').value.trim();
  const triage = $('#patientTriage').value;
  const location = $('#patientLocation').value.trim();
  const nurse = $('#patientNurse').value.trim();
  
  if (!name || !complaint || !triage) {
    alert('Veuillez remplir tous les champs obligatoires');
    return;
  }
  
  const patient = {
    id: 'patient_' + Date.now(),
    name,
    complaint,
    triage,
    location,
    nurse,
    tasks: [],
    createdAt: new Date().toISOString()
  };
  
  patients[currentUser].push(patient);
  statistics[currentUser].added++;
  
  saveUserData();
  renderPatients();
  updateStatistics();
  
  // Close modal
  $('.modal-overlay').remove();
  
  console.log('Patient added:', patient.name);
}

// Update statistics display
function updateStatistics() {
  const stats = statistics[currentUser] || {};
  
  $('#sAdded').textContent = stats.added || 0;
  $('#sHosp').textContent = stats.hospitalized || 0;
  $('#sHome').textContent = stats.discharged || 0;
  $('#sDel').textContent = stats.deleted || 0;
}

// Reset statistics
function resetStatistics() {
  if (confirm('Êtes-vous sûr de vouloir réinitialiser toutes les statistiques ?')) {
    statistics[currentUser] = {
      added: 0,
      hospitalized: 0,
      discharged: 0,
      deleted: 0
    };
    saveUserData();
    updateStatistics();
    console.log('Statistics reset');
  }
}

// Global functions for onclick handlers
window.editPatientInfo = function(patientId) {
  console.log('Edit patient info:', patientId);
  // Implementation for editing patient info
};

window.showAddTaskModal = function(patientId) {
  console.log('Show add task modal for:', patientId);
  // Implementation for task modal
};

window.showDecisionMenu = function(patientId, buttonElement) {
  console.log('Show decision menu for:', patientId);
  // Implementation for decision menu
};

window.completeTask = function(patientId, taskId) {
  console.log('Complete task:', taskId, 'for patient:', patientId);
  // Implementation for task completion
};

window.saveNewPatient = saveNewPatient;

// Multiple initialization approaches for maximum reliability
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  // DOM already loaded
  initializeApp();
}

// Backup initialization
window.addEventListener('load', function() {
  if (!currentUser) {
    console.log('Backup initialization triggered');
    initializeApp();
  }
});

// Immediate initialization attempt
setTimeout(initializeApp, 100);

console.log('FastTrackers script loaded');
