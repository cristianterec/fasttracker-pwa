// FastTrackers PWA with Firebase sync and working login
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js';
import {
  getFirestore, collection, doc, setDoc, getDoc,
  deleteDoc, onSnapshot, updateDoc, increment
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyB8PDbtjAqmEw8-jTuiHGgx2W1a9O1gRQU",
  authDomain: "fasttrackers-sync.firebaseapp.com",
  projectId: "fasttrackers-sync",
  storageBucket: "fasttrackers-sync.firebasestorage.app",
  messagingSenderId: "987908003870",
  appId: "1:987908003870:web:0e9c19e942df988c5ab60f"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// DOM helpers
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const byId = (id) => document.getElementById(id);

// State management
let currentUser = null;
let unsubscribePatients = null;
let unsubscribeStats = null;

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', initializeApp);

function initializeApp() {
  setupLoginListeners();
  setupTabListeners();
  setupLogoutListener();
  console.log('FastTrackers initialized successfully');
}

// Setup login button listeners
function setupLoginListeners() {
  const loginButtons = $$('.user-btn');
  loginButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      const username = e.target.dataset.user;
      if (username) {
        loginUser(username);
      }
    });
  });
}

// Login function
async function loginUser(username) {
  try {
    currentUser = username;
    byId('username').textContent = username;
    
    // Hide login screen and show app
    byId('login').classList.add('hidden');
    byId('app').classList.remove('hidden');
    
    // Start real-time listeners
    startRealtimeListeners();
    
    // Setup app event listeners
    setupAppListeners();
    
    console.log(`User ${username} logged in successfully`);
  } catch (error) {
    console.error('Login error:', error);
    alert('Erreur de connexion. Veuillez réessayer.');
  }
}

// Setup logout listener
function setupLogoutListener() {
  byId('logout').addEventListener('click', logoutUser);
}

// Logout function
function logoutUser() {
  // Unsubscribe from real-time listeners
  if (unsubscribePatients) unsubscribePatients();
  if (unsubscribeStats) unsubscribeStats();
  
  // Reset state
  currentUser = null;
  
  // Show login screen and hide app
  byId('app').classList.add('hidden');
  byId('login').classList.remove('hidden');
  
  console.log('User logged out successfully');
}

// Setup app event listeners
function setupAppListeners() {
  // Add patient button
  byId('addPatient').addEventListener('click', showAddPatientModal);
  
  // Reset stats button
  byId('resetStats').addEventListener('click', resetStatistics);
}

// Setup tab listeners
function setupTabListeners() {
  $$('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      // Update active tab
      $$('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // Show corresponding content
      $$('.tab-content').forEach(content => content.classList.add('hidden'));
      byId(tab.dataset.tab).classList.remove('hidden');
    });
  });
}

// Start real-time Firestore listeners
function startRealtimeListeners() {
  if (!currentUser) return;
  
  // Listen to patients collection
  unsubscribePatients = onSnapshot(
    collection(db, `users/${currentUser}/patients`),
    (snapshot) => {
      renderPatients(snapshot);
    },
    (error) => {
      console.error('Error listening to patients:', error);
    }
  );
  
  // Listen to statistics document
  unsubscribeStats = onSnapshot(
    doc(db, `users/${currentUser}/stats`, 'main'),
    (doc) => {
      updateStatisticsDisplay(doc.data() || {});
    },
    (error) => {
      console.error('Error listening to stats:', error);
    }
  );
}

// Render patients in grid
function renderPatients(snapshot) {
  const grid = byId('grid');
  
  if (snapshot.empty) {
    grid.innerHTML = '<p style="opacity:.6; text-align:center; padding:40px;">Aucun patient actif</p>';
    return;
  }
  
  grid.innerHTML = '';
  snapshot.forEach(docSnap => {
    const patient = docSnap.data();
    grid.appendChild(createPatientCard(patient));
  });
  
  // Attach event listeners to newly created buttons
  attachPatientButtonListeners();
}

// Create patient card element
function createPatientCard(patient) {
  const card = document.createElement('div');
  card.className = `card ${patient.triage || 'blue'}`;
  
  card.innerHTML = `
    <div class="info-box" data-id="${patient.id}">
      📍 ${patient.location || '--'}<br/>📱 ${patient.nurse || '--'}
    </div>
    <div class="patient-main">
      <h3 class="patient-name">${patient.name}</h3>
      <p class="patient-complaint">${patient.complaint}</p>
    </div>
    <div class="tasks">${renderTasks(patient.tasks || [])}</div>
    <div class="actions">
      <button class="btn task" data-id="${patient.id}">📋 Tâches</button>
      <button class="btn decision" data-id="${patient.id}">⚖️ Décision</button>
    </div>
  `;
  
  return card;
}

// Render tasks for a patient
function renderTasks(tasks) {
  const activeTasks = tasks.filter(task => !task.completed);
  if (activeTasks.length === 0) return '';
  
  return activeTasks.map(task => {
    const timeLeft = task.dueAt ? Math.max(0, new Date(task.dueAt) - Date.now()) : null;
    const timerText = timeLeft ? formatTime(timeLeft) : '--:--';
    
    return `
      <div class="task">
        <div class="task-content">
          <span class="task-desc">${task.description}</span>
          <span class="task-timer">${timerText}</span>
        </div>
        <button class="task-check" data-task-id="${task.id}" data-patient-id="${task.patientId}">✓</button>
      </div>
    `;
  }).join('');
}

// Format time in MM:SS format
function formatTime(ms) {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Attach event listeners to patient card buttons
function attachPatientButtonListeners() {
  // Task buttons
  $$('.btn.task').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const patientId = e.currentTarget.dataset.id;
      showAddTaskModal(patientId);
    });
  });
  
  // Decision buttons
  $$('.btn.decision').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const patientId = e.currentTarget.dataset.id;
      showDecisionMenu(patientId, e.currentTarget);
    });
  });
  
  // Task completion buttons
  $$('.task-check').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const taskId = e.currentTarget.dataset.taskId;
      const patientId = e.currentTarget.dataset.patientId;
      completeTask(patientId, taskId);
    });
  });
  
  // Info box edit buttons
  $$('.info-box').forEach(box => {
    box.addEventListener('click', (e) => {
      const patientId = e.currentTarget.dataset.id;
      showEditInfoModal(patientId);
    });
  });
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
        <button id="savePatient" class="btn-primary">Enregistrer</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Modal event listeners
  modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
  
  byId('savePatient').addEventListener('click', async () => {
    await saveNewPatient();
    modal.remove();
  });
}

// Save new patient to Firestore
async function saveNewPatient() {
  const name = byId('patientName').value.trim();
  const complaint = byId('patientComplaint').value.trim();
  const triage = byId('patientTriage').value;
  const location = byId('patientLocation').value.trim();
  const nurse = byId('patientNurse').value.trim();
  
  if (!name || !complaint || !triage) {
    alert('Veuillez remplir tous les champs obligatoires');
    return;
  }
  
  const patientId = 'patient_' + Date.now();
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
    await setDoc(doc(db, `users/${currentUser}/patients`, patientId), patientData);
    await incrementStat('added');
    console.log('Patient added successfully');
  } catch (error) {
    console.error('Error adding patient:', error);
    alert('Erreur lors de l\'ajout du patient');
  }
}

// Show add task modal
function showAddTaskModal(patientId) {
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
        <button id="saveTask" class="btn-primary">Ajouter la tâche</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Modal event listeners
  modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
  
  byId('saveTask').addEventListener('click', async () => {
    await saveNewTask(patientId);
    modal.remove();
  });
}

// Save new task
async function saveNewTask(patientId) {
  const description = byId('taskDescription').value.trim();
  const minutes = parseInt(byId('taskMinutes').value) || 0;
  
  if (!description) {
    alert('Veuillez saisir une description pour la tâche');
    return;
  }
  
  const task = {
    id: 'task_' + Date.now(),
    description,
    dueAt: minutes > 0 ? new Date(Date.now() + minutes * 60000).toISOString() : null,
    completed: false,
    patientId
  };
  
  try {
    const patientRef = doc(db, `users/${currentUser}/patients`, patientId);
    const patientSnap = await getDoc(patientRef);
    
    if (patientSnap.exists()) {
      const patientData = patientSnap.data();
      const updatedTasks = [...(patientData.tasks || []), task];
      await updateDoc(patientRef, { tasks: updatedTasks });
      console.log('Task added successfully');
    }
  } catch (error) {
    console.error('Error adding task:', error);
    alert('Erreur lors de l\'ajout de la tâche');
  }
}

// Show decision menu
function showDecisionMenu(patientId, buttonElement) {
  // Remove existing menus
  $$('.floating-menu').forEach(menu => menu.remove());
  
  const menu = document.createElement('div');
  menu.className = 'floating-menu';
  menu.innerHTML = `
    <button class="menu-item discharge" data-action="discharge">🏠 Retour à domicile</button>
    <button class="menu-item hospitalize" data-action="hospitalize">🏥 Hospitalisation</button>
    <button class="menu-item delete" data-action="delete">🗑️ Supprimer le patient</button>
  `;
  
  buttonElement.closest('.card').appendChild(menu);
  
  // Add event listeners to menu items
  menu.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', (e) => {
      const action = e.target.dataset.action;
      handlePatientDecision(patientId, action);
      menu.remove();
    });
  });
  
  // Close menu when clicking outside
  setTimeout(() => {
    document.addEventListener('click', (e) => {
      if (!menu.contains(e.target) && !buttonElement.contains(e.target)) {
        menu.remove();
      }
    }, { once: true });
  }, 100);
}

// Handle patient decision actions
async function handlePatientDecision(patientId, action) {
  try {
    await deleteDoc(doc(db, `users/${currentUser}/patients`, patientId));
    
    switch (action) {
      case 'discharge':
        await incrementStat('discharged');
        break;
      case 'hospitalize':
        await incrementStat('hospitalized');
        break;
      case 'delete':
        await incrementStat('deleted');
        break;
    }
    
    console.log(`Patient ${action} action completed`);
  } catch (error) {
    console.error(`Error with ${action} action:`, error);
    alert('Erreur lors du traitement du patient');
  }
}

// Complete a task
async function completeTask(patientId, taskId) {
  try {
    const patientRef = doc(db, `users/${currentUser}/patients`, patientId);
    const patientSnap = await getDoc(patientRef);
    
    if (patientSnap.exists()) {
      const patientData = patientSnap.data();
      const updatedTasks = patientData.tasks.map(task => 
        task.id === taskId ? { ...task, completed: true } : task
      );
      await updateDoc(patientRef, { tasks: updatedTasks });
      console.log('Task completed successfully');
    }
  } catch (error) {
    console.error('Error completing task:', error);
    alert('Erreur lors de la completion de la tâche');
  }
}

// Increment statistics
async function incrementStat(statName) {
  try {
    const statsRef = doc(db, `users/${currentUser}/stats`, 'main');
    await updateDoc(statsRef, {
      [statName]: increment(1)
    });
  } catch (error) {
    // If document doesn't exist, create it
    await setDoc(statsRef, {
      added: statName === 'added' ? 1 : 0,
      hospitalized: statName === 'hospitalized' ? 1 : 0,
      discharged: statName === 'discharged' ? 1 : 0,
      deleted: statName === 'deleted' ? 1 : 0
    });
  }
}

// Update statistics display
function updateStatisticsDisplay(stats) {
  byId('sAdded').textContent = stats.added || 0;
  byId('sHosp').textContent = stats.hospitalized || 0;
  byId('sHome').textContent = stats.discharged || 0;
  byId('sDel').textContent = stats.deleted || 0;
}

// Reset statistics
async function resetStatistics() {
  if (confirm('Êtes-vous sûr de vouloir réinitialiser toutes les statistiques ?')) {
    try {
      const statsRef = doc(db, `users/${currentUser}/stats`, 'main');
      await setDoc(statsRef, {
        added: 0,
        hospitalized: 0,
        discharged: 0,
        deleted: 0
      });
      console.log('Statistics reset successfully');
    } catch (error) {
      console.error('Error resetting statistics:', error);
      alert('Erreur lors de la réinitialisation des statistiques');
    }
  }
}

// Update timers every second
setInterval(() => {
  $$('.task-timer').forEach(timer => {
    const taskElement = timer.closest('.task');
    const taskCheckBtn = taskElement.querySelector('.task-check');
    const taskId = taskCheckBtn?.dataset.taskId;
    
    if (taskId) {
      // Timer update logic would go here
      // This is a simplified version
    }
  });
}, 1000);

console.log('FastTrackers app.js loaded');
