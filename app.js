// FastTrackers PWA - Fixed Version with French Interface
console.log('FastTrackers loading - version française avec correctifs FAB et stats...');

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
let unsubscribeTransfers = null;
let app = null;
let updateTimerHandle = null;
let liveTimerHandle = null;

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
      limit,
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
      collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, increment, 
      getDoc, getDocs, query, where, orderBy, limit, writeBatch, serverTimestamp
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

  // PIN input validation
  ['#pinInput', '#registerPin', '#confirmPin'].forEach(id => {
    const element = $(id);
    if (element) {
      element.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/[^0-9]/g, '');
      });
    }
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
    
    // Initialize user data
    await initializeUserData(userId);
    
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

// Initialize user data
async function initializeUserData(userId) {
  const { doc, setDoc } = window.firestoreFunctions;
  
  // Initialize stats
  await setDoc(doc(db, 'users', userId, 'stats', 'main'), {
    added: 0,
    hospitalized: 0,
    discharged: 0,
    transferred: 0,
    totalTime: 0,
    totalPatients: 0
  });
  
  // Initialize task suggestions
  await setDoc(doc(db, 'users', userId, 'taskSuggestions', 'main'), {
    suggestions: [
      { description: "Senior", timer: 0, frequency: 1 },
      { description: "Bilan bio", timer: 70, frequency: 1 },
      { description: "ECG", timer: 0, frequency: 1 },
      { description: "BU", timer: 0, frequency: 1 }
    ]
  });

  // Initialize templates
  await setDoc(doc(db, 'users', userId, 'templates', 'main'), {
    templateHemo: '',
    templateResp: '',
    templateDig: '',
    templateNeuro: '',
    templateOsteo: '',
    templateAutre: ''
  });
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
    await checkForTransfers();
    startLiveTimers();
    
    console.log('Login successful for:', currentUser);
    
  } catch (error) {
    console.error('Login error:', error);
    alert('Erreur de connexion');
  }
}

// Check for pending transfers
async function checkForTransfers() {
  try {
    const { collection, getDocs, query, where } = window.firestoreFunctions;
    const transfersQuery = query(
      collection(db, 'transfers'),
      where('targetUserId', '==', currentUserId),
      where('status', '==', 'pending')
    );
    
    const transfersSnapshot = await getDocs(transfersQuery);
    
    if (!transfersSnapshot.empty) {
      const transfer = transfersSnapshot.docs[0].data();
      showTransferAcceptanceModal(transfer, transfersSnapshot.docs[0].id);
    }
  } catch (error) {
    console.error('Error checking transfers:', error);
  }
}

// Show transfer acceptance modal
function showTransferAcceptanceModal(transfer, transferId) {
  const modal = $('#transferAcceptModal');
  $('#transferCount').textContent = transfer.patientIds.length;
  $('#transferFrom').textContent = transfer.fromUserName;
  
  const patientsList = $('#transferPatientsList');
  patientsList.innerHTML = transfer.patients.map(patient => 
    `<div class="transfer-patient-item">
      <strong>${patient.name}</strong> - ${patient.complaint} (${getTriageDisplayName(patient.triage)})
    </div>`
  ).join('');
  
  modal.classList.remove('hidden');
  
  const acceptBtn = $('#acceptTransfer');
  const declineBtn = $('#declineTransfer');
  
  acceptBtn.onclick = () => acceptTransfer(transferId, transfer);
  declineBtn.onclick = () => declineTransfer(transferId, transfer);
}

// Accept transfer
async function acceptTransfer(transferId, transfer) {
  try {
    const { doc, setDoc, updateDoc, writeBatch } = window.firestoreFunctions;
    const batch = writeBatch(db);
    
    // Add patients to current user
    for (const patient of transfer.patients) {
      const patientId = generateId('patient');
      const patientData = {
        ...patient,
        id: patientId,
        userId: currentUserId,
        transferredFrom: transfer.fromUserId,
        transferredAt: new Date().toISOString()
      };
      
      batch.set(doc(db, 'users', currentUserId, 'patients', patientId), patientData);
    }
    
    // Update transfer status
    batch.update(doc(db, 'transfers', transferId), { 
      status: 'accepted',
      acceptedAt: new Date().toISOString()
    });
    
    await batch.commit();
    
    $('#transferAcceptModal').classList.add('hidden');
    alert(`${transfer.patients.length} patient(s) accepté(s) avec succès!`);
    
  } catch (error) {
    console.error('Error accepting transfer:', error);
    alert('Erreur lors de l\'acceptation du transfert');
  }
}

// Decline transfer
async function declineTransfer(transferId, transfer) {
  try {
    const { doc, updateDoc, writeBatch, setDoc } = window.firestoreFunctions;
    const batch = writeBatch(db);
    
    // Return patients to original user
    for (const patient of transfer.patients) {
      const patientId = generateId('patient');
      const patientData = {
        ...patient,
        id: patientId,
        userId: transfer.fromUserId,
        declinedTransferAt: new Date().toISOString()
      };
      
      batch.set(doc(db, 'users', transfer.fromUserId, 'patients', patientId), patientData);
    }
    
    // Update transfer status
    batch.update(doc(db, 'transfers', transferId), {
      status: 'declined',
      declinedAt: new Date().toISOString()
    });
    
    await batch.commit();
    
    $('#transferAcceptModal').classList.add('hidden');
    alert('Transfert refusé - les patients sont retournés à l\'expéditeur');
    
  } catch (error) {
    console.error('Error declining transfer:', error);
  }
}

// Start real-time listeners - FIXED STATS LISTENER
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
    
    // Stats listener - FIXED
    unsubscribeStats = onSnapshot(doc(db, 'users', currentUserId, 'stats', 'main'), (doc) => {
      if (doc.exists()) {
        const stats = doc.data();
        updateStatsDisplay(stats);
      } else {
        // Initialize stats if they don't exist
        updateStatsDisplay({
          added: 0,
          hospitalized: 0,
          discharged: 0,
          transferred: 0,
          totalTime: 0,
          totalPatients: 0
        });
      }
    });

    // Transfers listener
    unsubscribeTransfers = onSnapshot(query(
      collection(db, 'transfers'),
      where('targetUserId', '==', currentUserId),
      where('status', '==', 'pending')
    ), (snapshot) => {
      if (!snapshot.empty) {
        const transfer = snapshot.docs[0].data();
        showTransferAcceptanceModal(transfer, snapshot.docs[0].id);
      }
    });
    
  } catch (error) {
    console.error('Error setting up listeners:', error);
  }
}

// Setup app event listeners - FIXED FAB BUTTONS WITH EVENT DELEGATION
function setupAppEventListeners() {
  // Navigation
  $$('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      switchTab(tab.dataset.tab);
    });
  });
  
  // Username button for profile access
  $('#usernameBtn').addEventListener('click', () => {
    switchTab('profile');
  });
  
  $('#logout').addEventListener('click', logout);
  
  // Patient management
  $('#addPatient').addEventListener('click', showAddPatientModal);
  $('#transferBtn').addEventListener('click', showTransferModal);
  
  // Profile management
  $('#editNameBtn').addEventListener('click', showEditNameModal);
  $('#changePinBtn').addEventListener('click', showChangePinModal);
  $('#deleteAccountBtn').addEventListener('click', handleDeleteAccount);
  
  // FAB BUTTONS - FIXED with persistent event delegation
  document.addEventListener('click', (e) => {
    if (e.target.id === 'phoneBookBtn' || e.target.closest('#phoneBookBtn')) {
      e.preventDefault();
      e.stopPropagation();
      showPhoneBookModal();
    }
    if (e.target.id === 'templatesBtn' || e.target.closest('#templatesBtn')) {
      e.preventDefault();
      e.stopPropagation();
      showTemplatesModal();
    }
  });
  
  // Stats
  $('#resetStats').addEventListener('click', resetStats);
  
  // Global click delegation
  document.addEventListener('click', globalClickHandler);
  
  // Modal handling
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay') && !e.target.closest('.modal')) {
      e.target.classList.add('hidden');
    }
    
    if (e.target.matches('.modal-close')) {
      e.target.closest('.modal-overlay').classList.add('hidden');
    }
  });
}

// Global click handler
function globalClickHandler(e) {
  if (e.defaultPrevented) return;
  
  // Patient card click for editing
  if (e.target.closest('.card') && !e.target.closest('button') && !e.target.closest('.task')) {
    const card = e.target.closest('.card');
    const patientId = card.dataset.patientId;
    if (patientId) {
      editPatient(patientId);
      return;
    }
  }
  
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
    if (confirm('Supprimer cette tâche ?')) {
      deleteTask(e.target.dataset.pid, e.target.dataset.tid);
    }
    return;
  }
  
  // Patient notes
  if (e.target.matches('.patient-notes-btn')) {
    e.preventDefault();
    const patientId = e.target.dataset.pid;
    showPatientNotesModal(patientId);
    return;
  }
  
  // Decision menu items
  if (e.target.matches('.menu-item')) {
    e.preventDefault();
    handlePatientDecision(e.target.dataset.pid, e.target.dataset.action);
    return;
  }
  
  // Triage circles
  if (e.target.matches('.triage-circle')) {
    e.preventDefault();
    selectTriageCircle(e.target);
    return;
  }
  
  // Task suggestions
  if (e.target.matches('.suggestion-chip')) {
    e.preventDefault();
    applySuggestion(e.target);
    return;
  }

  // Template copy buttons
  if (e.target.matches('.copy-template-btn')) {
    e.preventDefault();
    copyTemplateText(e.target);
    return;
  }

  // Phone book actions
  if (e.target.matches('.edit-phone')) {
    e.preventDefault();
    editPhone(e.target.dataset.id);
    return;
  }

  if (e.target.matches('.delete-phone')) {
    e.preventDefault();
    if (confirm('Supprimer ce numéro ?')) {
      deletePhone(e.target.dataset.id);
    }
    return;
  }
}

// Logout
function logout() {
  if (unsubscribePatients) unsubscribePatients();
  if (unsubscribeStats) unsubscribeStats();
  if (unsubscribeTransfers) unsubscribeTransfers();
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
  const targetTab = $(`[data-tab="${tabName}"]`);
  if (targetTab) targetTab.classList.add('active');
  
  $$('.tab-content').forEach(content => content.classList.add('hidden'));
  $(`#${tabName}`).classList.remove('hidden');
}

// Live timers
function startLiveTimers() {
  if (updateTimerHandle) clearInterval(updateTimerHandle);
  if (liveTimerHandle) clearInterval(liveTimerHandle);
  
  // Task countdown timers
  updateTimerHandle = setInterval(updateAllTimers, 1000);
  
  // Live elapsed time timers
  liveTimerHandle = setInterval(updateLiveTimers, 1000);
}

function stopLiveTimers() {
  clearInterval(updateTimerHandle);
  clearInterval(liveTimerHandle);
  updateTimerHandle = null;
  liveTimerHandle = null;
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

function updateLiveTimers() {
  const now = Date.now();
  $$('.live-timer').forEach(el => {
    const createdAt = new Date(el.dataset.created).getTime();
    const elapsed = now - createdAt;
    el.textContent = formatElapsedTime(elapsed);
  });
}

function formatTime(ms) {
  if (ms <= 0) return '00:00';
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function formatElapsedTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  
  const totalMinutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  
  if (totalMinutes < 60) {
    return `${totalMinutes}m ${remainingSeconds.toString().padStart(2, '0')}s`;
  }
  
  const hours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  
  return `${hours}h ${remainingMinutes.toString().padStart(2, '0')}m`;
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
  
  // Patient notes display
  const notesDisplay = patient.notes && patient.notes.trim() ? 
    `<div class="patient-notes">
      <span class="objective-emoji">🎯</span>
      <div class="notes-text">${patient.notes}</div>
    </div>` : '';
  
  return `
    <div class="card ${patient.triage}" data-patient-id="${patient.id}">
      <!-- Live timer -->
      <div class="live-timer" data-created="${patient.createdAt}">
        ${formatElapsedTime(Date.now() - new Date(patient.createdAt).getTime())}
      </div>
      
      <div class="info-box">
        <div>📍 ${patient.location || '—'}</div>
        <div>📱 ${patient.nurse || '—'}</div>
      </div>
      
      <div class="patient-main">
        <div class="patient-name">
          ${patient.name}
          <button class="patient-notes-btn" data-pid="${patient.id}">📝</button>
        </div>
        <div class="patient-complaint">${patient.complaint}</div>
      </div>
      
      ${notesDisplay}
      
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
  const timer = task.dueAt && !isCompleted ? 
    `<span class="task-timer" data-dueat="${task.dueAt}">${formatTime(new Date(task.dueAt) - Date.now())}</span>` : '';
  
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

// Show add patient modal with triage circles
function showAddPatientModal() {
  const modal = createModal('➕ Nouveau patient', `
    <input id="patientName" placeholder="Nom du patient *" required>
    <input id="patientComplaint" placeholder="Motif de consultation *" required>
    
    <div class="form-section">
      <label>Niveau de triage :</label>
      <div class="triage-circles">
        <div class="triage-circle red" data-triage="red" title="Rouge - Critique"></div>
        <div class="triage-circle orange" data-triage="orange" title="Orange - Très urgent"></div>
        <div class="triage-circle yellow" data-triage="yellow" title="Jaune - Urgent"></div>
        <div class="triage-circle green" data-triage="green" title="Vert - Semi-urgent"></div>
        <div class="triage-circle blue" data-triage="blue" title="Bleu - Moins urgent"></div>
        <div class="triage-circle purple" data-triage="purple" title="Violet - Non urgent"></div>
      </div>
    </div>
    
    <input id="patientLocation" placeholder="📍 Localisation">
    <input id="patientNurse" placeholder="📱 Numéro infirmière">
    <button class="btn-primary" id="savePatient" disabled>Enregistrer</button>
  `);
  
  $('#savePatient').addEventListener('click', savePatient);
}

// Select triage circle
function selectTriageCircle(circle) {
  $$('.triage-circle').forEach(c => c.classList.remove('selected'));
  circle.classList.add('selected');
  const saveBtn = $('#savePatient');
  if (saveBtn) saveBtn.disabled = false;
}

// Save patient
async function savePatient() {
  const name = $('#patientName').value.trim();
  const complaint = $('#patientComplaint').value.trim();
  const selectedTriage = $('.triage-circle.selected');
  const location = $('#patientLocation').value.trim();
  const nurse = $('#patientNurse').value.trim();
  
  if (!name || !complaint || !selectedTriage) {
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
      triage: selectedTriage.dataset.triage,
      location,
      nurse,
      tasks: [],
      notes: '',
      createdAt: now,
      userId: currentUserId
    };
    
    await setDoc(doc(db, 'users', currentUserId, 'patients', patientId), patientData);
    await updateStats('added', 1);
    
    closeAllModals();
    console.log('Patient ajouté:', name);
    
  } catch (error) {
    console.error('Error adding patient:', error);
    alert('Erreur lors de l\'ajout du patient');
  }
}

// Edit patient
async function editPatient(patientId) {
  try {
    const { doc, getDoc } = window.firestoreFunctions;
    const patientSnap = await getDoc(doc(db, 'users', currentUserId, 'patients', patientId));
    
    if (!patientSnap.exists()) return;
    
    const patient = patientSnap.data();
    
    const modal = createModal('✏️ Modifier le patient', `
      <input id="editPatientName" placeholder="Nom du patient" value="${patient.name}">
      <input id="editPatientComplaint" placeholder="Motif de consultation" value="${patient.complaint}">
      
      <div class="form-section">
        <label>Niveau de triage :</label>
        <div class="triage-circles">
          <div class="triage-circle red ${patient.triage === 'red' ? 'selected' : ''}" data-triage="red"></div>
          <div class="triage-circle orange ${patient.triage === 'orange' ? 'selected' : ''}" data-triage="orange"></div>
          <div class="triage-circle yellow ${patient.triage === 'yellow' ? 'selected' : ''}" data-triage="yellow"></div>
          <div class="triage-circle green ${patient.triage === 'green' ? 'selected' : ''}" data-triage="green"></div>
          <div class="triage-circle blue ${patient.triage === 'blue' ? 'selected' : ''}" data-triage="blue"></div>
          <div class="triage-circle purple ${patient.triage === 'purple' ? 'selected' : ''}" data-triage="purple"></div>
        </div>
      </div>
      
      <input id="editPatientLocation" placeholder="📍 Localisation" value="${patient.location || ''}">
      <input id="editPatientNurse" placeholder="📱 Numéro infirmière" value="${patient.nurse || ''}">
      <button class="btn-primary" id="updatePatient">Mettre à jour</button>
    `);
    
    $('#updatePatient').addEventListener('click', () => updatePatient(patientId));
    
  } catch (error) {
    console.error('Error loading patient:', error);
  }
}

// Update patient
async function updatePatient(patientId) {
  const name = $('#editPatientName').value.trim();
  const complaint = $('#editPatientComplaint').value.trim();
  const selectedTriage = $('.triage-circle.selected');
  const location = $('#editPatientLocation').value.trim();
  const nurse = $('#editPatientNurse').value.trim();
  
  if (!name || !complaint || !selectedTriage) {
    alert('Veuillez remplir tous les champs obligatoires');
    return;
  }
  
  try {
    const { doc, updateDoc } = window.firestoreFunctions;
    
    await updateDoc(doc(db, 'users', currentUserId, 'patients', patientId), {
      name,
      complaint,
      triage: selectedTriage.dataset.triage,
      location,
      nurse,
      updatedAt: new Date().toISOString()
    });
    
    closeAllModals();
    
  } catch (error) {
    console.error('Error updating patient:', error);
    alert('Erreur lors de la mise à jour');
  }
}

// Show add task modal with suggestions
function showAddTaskModal(patientId) {
  const modal = createModal('📋 Nouvelle tâche', `
    <input id="taskDescription" placeholder="Description de la tâche *" required>
    <input id="taskMinutes" type="number" placeholder="⏰ Délai en minutes (optionnel)" min="1" max="1440">
    
    <div class="task-suggestions">
      <h4>Suggestions :</h4>
      <div class="suggestion-chips" id="suggestionChips"></div>
    </div>
    
    <button class="btn-primary" id="saveTask">Ajouter la tâche</button>
  `);
  
  loadTaskSuggestions();
  $('#saveTask').addEventListener('click', () => saveTask(patientId));
}

// Load task suggestions
async function loadTaskSuggestions() {
  try {
    const { doc, getDoc } = window.firestoreFunctions;
    const suggestionsSnap = await getDoc(doc(db, 'users', currentUserId, 'taskSuggestions', 'main'));
    
    if (suggestionsSnap.exists()) {
      const data = suggestionsSnap.data();
      const container = $('#suggestionChips');
      
      if (container) {
        const suggestions = data.suggestions.sort((a, b) => b.frequency - a.frequency);
        
        container.innerHTML = suggestions.map(s => 
          `<div class="suggestion-chip" data-description="${s.description}" data-timer="${s.timer}">
            ${s.description}${s.timer > 0 ? ` (${s.timer}min)` : ''}
          </div>`
        ).join('');
      }
    }
  } catch (error) {
    console.error('Error loading task suggestions:', error);
  }
}

// Apply suggestion
function applySuggestion(chip) {
  $('#taskDescription').value = chip.dataset.description;
  $('#taskMinutes').value = chip.dataset.timer || '';
}

// Save task
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
      
      await updateTaskSuggestions(description, minutes);
    }
    
    closeAllModals();
    
  } catch (error) {
    console.error('Error adding task:', error);
    alert('Erreur lors de l\'ajout de la tâche');
  }
}

// Update task suggestions based on usage
async function updateTaskSuggestions(description, timer) {
  try {
    const { doc, getDoc, setDoc } = window.firestoreFunctions;
    const suggestionsRef = doc(db, 'users', currentUserId, 'taskSuggestions', 'main');
    const suggestionsSnap = await getDoc(suggestionsRef);
    
    let suggestions = [];
    if (suggestionsSnap.exists()) {
      suggestions = suggestionsSnap.data().suggestions || [];
    }
    
    const existingIndex = suggestions.findIndex(s => s.description === description);
    if (existingIndex >= 0) {
      suggestions[existingIndex].frequency++;
      suggestions[existingIndex].timer = timer;
    } else {
      suggestions.push({ description, timer, frequency: 1 });
    }
    
    suggestions.sort((a, b) => b.frequency - a.frequency);
    suggestions = suggestions.slice(0, 10);
    
    await setDoc(suggestionsRef, { suggestions });
    
  } catch (error) {
    console.error('Error updating task suggestions:', error);
  }
}

// Complete task
async function completeTask(patientId, taskId) {
  try {
    const { doc, getDoc, updateDoc } = window.firestoreFunctions;
    const patientRef = doc(db, 'users', currentUserId, 'patients', patientId);
    const patientSnap = await getDoc(patientRef);
    
    if (patientSnap.exists()) {
      const patientData = patientSnap.data();
      const updatedTasks = patientData.tasks.map(task => 
        task.id === taskId ? { ...task, completed: true, completedAt: new Date().toISOString() } : task
      );
      await updateDoc(patientRef, { tasks: updatedTasks });
    }
    
  } catch (error) {
    console.error('Error completing task:', error);
  }
}

// Delete task
async function deleteTask(patientId, taskId) {
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

// Show decision menu
function showDecisionMenu(patientId, buttonElement) {
  $$('.floating-menu').forEach(menu => menu.remove());
  
  const menu = document.createElement('div');
  menu.className = 'floating-menu';
  menu.style.bottom = '60px';
  menu.style.right = '20px';
  menu.innerHTML = `
    <button class="menu-item discharge" data-action="discharge" data-pid="${patientId}">
      🏠 Retour à domicile
    </button>
    <button class="menu-item hospitalize" data-action="hospitalize" data-pid="${patientId}">
      🏥 Hospitalisation
    </button>
    <button class="menu-item transfer" data-action="transfer" data-pid="${patientId}">
      🚑 Transfert
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
  try {
    const { doc, getDoc, deleteDoc } = window.firestoreFunctions;
    
    // Get patient data for time calculation
    const patientSnap = await getDoc(doc(db, 'users', currentUserId, 'patients', patientId));
    let timeSpent = 0;
    let patientData = null;
    
    if (patientSnap.exists()) {
      patientData = patientSnap.data();
      const createdAt = new Date(patientData.createdAt);
      const now = new Date();
      timeSpent = Math.floor((now - createdAt) / 60000); // minutes
    }
    
    await deleteDoc(doc(db, 'users', currentUserId, 'patients', patientId));
    
    const statMap = {
      'discharge': 'discharged',
      'hospitalize': 'hospitalized',
      'transfer': 'transferred',
      'delete': 'deleted'
    };
    
    const statKey = statMap[action];
    await updateStats(statKey, 1);
    
    // Update time statistics (exclude deleted patients)
    if (action !== 'delete' && patientData) {
      await updateStats('totalTime', timeSpent);
      await updateStats('totalPatients', 1);
    }
    
    $$('.floating-menu').forEach(menu => menu.remove());
    
  } catch (error) {
    console.error('Error handling patient decision:', error);
  }
}

// Patient notes modal
function showPatientNotesModal(patientId) {
  loadPatientNotes(patientId);
}

async function loadPatientNotes(patientId) {
  try {
    const { doc, getDoc } = window.firestoreFunctions;
    const patientSnap = await getDoc(doc(db, 'users', currentUserId, 'patients', patientId));
    
    if (patientSnap.exists()) {
      const patient = patientSnap.data();
      
      const modal = createModal('📝 Notes du patient', `
        <h4>${patient.name} - ${patient.complaint}</h4>
        <textarea id="patientNotes" placeholder="Objectifs, attentes, notes..." rows="6">${patient.notes || ''}</textarea>
        <button class="btn-primary" id="savePatientNotes">Sauvegarder</button>
      `);
      
      $('#savePatientNotes').addEventListener('click', () => savePatientNotes(patientId));
    }
  } catch (error) {
    console.error('Error loading patient notes:', error);
  }
}

// Save patient notes
async function savePatientNotes(patientId) {
  const notes = $('#patientNotes').value.trim();
  
  try {
    const { doc, updateDoc } = window.firestoreFunctions;
    await updateDoc(doc(db, 'users', currentUserId, 'patients', patientId), {
      notes,
      notesUpdatedAt: new Date().toISOString()
    });
    
    closeAllModals();
    
  } catch (error) {
    console.error('Error saving patient notes:', error);
  }
}

// Transfer modal
function showTransferModal() {
  const modal = createModal('🔄 Relève - Transfert de patients', `
    <div class="transfer-section">
      <h3>Sélectionner l'utilisateur destinataire :</h3>
      <select id="transferUser" class="auth-select">
        <option value="">Choisir un utilisateur</option>
      </select>
    </div>
    <div class="transfer-section">
      <h3>Sélectionner les patients à transférer :</h3>
      <div id="patientCheckboxes" class="checkbox-group"></div>
    </div>
    <button class="btn-primary" id="executeTransfer" disabled>Transférer</button>
  `);
  
  loadTransferUsers();
  loadTransferPatients();
  
  $('#transferUser').addEventListener('change', (e) => {
    $('#executeTransfer').disabled = !e.target.value;
  });
  
  $('#executeTransfer').addEventListener('click', executeTransfer);
}

async function loadTransferUsers() {
  try {
    const { collection, getDocs } = window.firestoreFunctions;
    const usersSnapshot = await getDocs(collection(db, 'users'));
    const select = $('#transferUser');
    
    if (select) {
      usersSnapshot.forEach(doc => {
        if (doc.id !== currentUserId) {
          const user = doc.data();
          const option = document.createElement('option');
          option.value = doc.id;
          option.textContent = user.name;
          select.appendChild(option);
        }
      });
    }
    
  } catch (error) {
    console.error('Error loading transfer users:', error);
  }
}

async function loadTransferPatients() {
  try {
    const { collection, getDocs } = window.firestoreFunctions;
    const patientsSnapshot = await getDocs(collection(db, 'users', currentUserId, 'patients'));
    const container = $('#patientCheckboxes');
    
    if (container) {
      container.innerHTML = '';
      
      patientsSnapshot.forEach(doc => {
        const patient = doc.data();
        const item = document.createElement('div');
        item.className = 'checkbox-item';
        item.innerHTML = `
          <input type="checkbox" id="patient_${doc.id}" value="${doc.id}">
          <label for="patient_${doc.id}">${patient.name} - ${patient.complaint} (${getTriageDisplayName(patient.triage)})</label>
        `;
        container.appendChild(item);
      });
    }
    
  } catch (error) {
    console.error('Error loading transfer patients:', error);
  }
}

// Execute transfer
async function executeTransfer() {
  const targetUserId = $('#transferUser').value;
  const selectedPatients = Array.from($$('#patientCheckboxes input:checked')).map(cb => cb.value);
  
  if (!targetUserId || selectedPatients.length === 0) {
    alert('Veuillez sélectionner un utilisateur et au moins un patient');
    return;
  }
  
  try {
    const { doc, getDoc, setDoc, deleteDoc } = window.firestoreFunctions;
    
    // Get target user name
    const targetUserSnap = await getDoc(doc(db, 'users', targetUserId));
    const targetUserName = targetUserSnap.exists() ? targetUserSnap.data().name : 'Utilisateur inconnu';
    
    // Collect patient data
    const patientsData = [];
    for (const patientId of selectedPatients) {
      const patientSnap = await getDoc(doc(db, 'users', currentUserId, 'patients', patientId));
      if (patientSnap.exists()) {
        patientsData.push(patientSnap.data());
      }
    }
    
    // Create transfer record
    const transferId = generateId('transfer');
    const transferData = {
      id: transferId,
      fromUserId: currentUserId,
      fromUserName: currentUser,
      targetUserId,
      targetUserName,
      patientIds: selectedPatients,
      patients: patientsData,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    
    await setDoc(doc(db, 'transfers', transferId), transferData);
    
    // Remove patients from current user
    for (const patientId of selectedPatients) {
      await deleteDoc(doc(db, 'users', currentUserId, 'patients', patientId));
    }
    
    closeAllModals();
    alert(`${selectedPatients.length} patient(s) transféré(s) vers ${targetUserName}. En attente d'acceptation.`);
    
  } catch (error) {
    console.error('Error executing transfer:', error);
    alert('Erreur lors du transfert');
  }
}

// Phone book functionality - FIXED
function showPhoneBookModal() {
  $('#phoneBookModal').classList.remove('hidden');
  loadPhoneBook();
  
  // Re-attach event listener to ensure it works
  const addBtn = $('#addPhoneNumber');
  if (addBtn) {
    addBtn.onclick = showAddPhoneModal;
  }
}

async function loadPhoneBook() {
  try {
    const { collection, getDocs, orderBy, query } = window.firestoreFunctions;
    const phoneQuery = query(
      collection(db, 'users', currentUserId, 'phoneBook'),
      orderBy('name', 'asc')
    );
    
    const phoneSnapshot = await getDocs(phoneQuery);
    const container = $('#phoneBookList');
    
    if (container) {
      if (phoneSnapshot.empty) {
        container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:20px;">Aucun numéro enregistré</p>';
        return;
      }
      
      container.innerHTML = '';
      phoneSnapshot.forEach(doc => {
        const phone = doc.data();
        const item = document.createElement('div');
        item.className = 'phone-item';
        item.innerHTML = `
          <div class="phone-info">
            <strong>${phone.name}</strong>
            <span>${phone.number}</span>
          </div>
          <div class="phone-actions">
            <button class="edit-phone" data-id="${doc.id}">✏️</button>
            <button class="delete-phone" data-id="${doc.id}">🗑️</button>
          </div>
        `;
        container.appendChild(item);
      });
    }
    
  } catch (error) {
    console.error('Error loading phone book:', error);
  }
}

function showAddPhoneModal() {
  const modal = createModal('➕ Ajouter un numéro', `
    <input id="phoneName" placeholder="Nom (ex: Cardiologue)" required>
    <input id="phoneNumber" placeholder="Numéro DECT" required>
    <button class="btn-primary" id="savePhone">Ajouter</button>
  `);

  $('#savePhone').addEventListener('click', savePhone);
}

async function savePhone() {
  const name = $('#phoneName').value.trim();
  const number = $('#phoneNumber').value.trim();

  if (!name || !number) {
    alert('Veuillez remplir tous les champs');
    return;
  }

  try {
    const { doc, setDoc } = window.firestoreFunctions;
    const phoneId = generateId('phone');

    await setDoc(doc(db, 'users', currentUserId, 'phoneBook', phoneId), {
      id: phoneId,
      name,
      number,
      createdAt: new Date().toISOString()
    });

    closeAllModals();
    // Re-show phone book modal
    setTimeout(() => {
      showPhoneBookModal();
    }, 100);

  } catch (error) {
    console.error('Error saving phone:', error);
  }
}

async function editPhone(phoneId) {
  try {
    const { doc, getDoc } = window.firestoreFunctions;
    const phoneSnap = await getDoc(doc(db, 'users', currentUserId, 'phoneBook', phoneId));

    if (phoneSnap.exists()) {
      const phone = phoneSnap.data();

      const modal = createModal('✏️ Modifier le numéro', `
        <input id="editPhoneName" placeholder="Nom" value="${phone.name}">
        <input id="editPhoneNumber" placeholder="Numéro" value="${phone.number}">
        <button class="btn-primary" id="updatePhone">Mettre à jour</button>
      `);

      $('#updatePhone').addEventListener('click', () => updatePhone(phoneId));
    }

  } catch (error) {
    console.error('Error loading phone:', error);
  }
}

async function updatePhone(phoneId) {
  const name = $('#editPhoneName').value.trim();
  const number = $('#editPhoneNumber').value.trim();

  if (!name || !number) {
    alert('Veuillez remplir tous les champs');
    return;
  }

  try {
    const { doc, updateDoc } = window.firestoreFunctions;

    await updateDoc(doc(db, 'users', currentUserId, 'phoneBook', phoneId), {
      name,
      number,
      updatedAt: new Date().toISOString()
    });

    closeAllModals();
    setTimeout(() => {
      showPhoneBookModal();
    }, 100);

  } catch (error) {
    console.error('Error updating phone:', error);
  }
}

async function deletePhone(phoneId) {
  try {
    const { doc, deleteDoc } = window.firestoreFunctions;
    await deleteDoc(doc(db, 'users', currentUserId, 'phoneBook', phoneId));
    loadPhoneBook();
  } catch (error) {
    console.error('Error deleting phone:', error);
  }
}

// Templates functionality - FIXED
function showTemplatesModal() {
  $('#templatesModal').classList.remove('hidden');
  loadTemplates();

  // Re-attach event listener
  const saveBtn = $('#saveTemplates');
  if (saveBtn) {
    saveBtn.onclick = saveTemplates;
  }
}

async function loadTemplates() {
  try {
    const { doc, getDoc } = window.firestoreFunctions;
    const templatesSnap = await getDoc(doc(db, 'users', currentUserId, 'templates', 'main'));

    if (templatesSnap.exists()) {
      const templates = templatesSnap.data();
      
      const templateIds = ['templateHemo', 'templateResp', 'templateDig', 'templateNeuro', 'templateOsteo', 'templateAutre'];
      templateIds.forEach(id => {
        const element = $(`#${id}`);
        if (element) {
          element.value = templates[id] || '';
        }
      });
    }

  } catch (error) {
    console.error('Error loading templates:', error);
  }
}

async function saveTemplates() {
  const templates = {
    templateHemo: $('#templateHemo').value || '',
    templateResp: $('#templateResp').value || '',
    templateDig: $('#templateDig').value || '',
    templateNeuro: $('#templateNeuro').value || '',
    templateOsteo: $('#templateOsteo').value || '',
    templateAutre: $('#templateAutre').value || ''
  };

  try {
    const { doc, setDoc } = window.firestoreFunctions;
    await setDoc(doc(db, 'users', currentUserId, 'templates', 'main'), templates);
    
    closeAllModals();
    alert('Modèles sauvegardés!');
    
  } catch (error) {
    console.error('Error saving templates:', error);
  }
}

// Copy template text
async function copyTemplateText(button) {
  const fieldId = button.dataset.field;
  const textarea = $(`#${fieldId}`);
  
  if (textarea && textarea.value.trim()) {
    try {
      await navigator.clipboard.writeText(textarea.value);
      
      button.classList.add('copied');
      button.textContent = '✅';
      
      setTimeout(() => {
        button.classList.remove('copied');
        button.textContent = '📋';
      }, 2000);
      
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      textarea.select();
      document.execCommand('copy');
    }
  }
}

// Statistics functions - FIXED
function updateStatsDisplay(stats) {
  $('#sAdded').textContent = stats.added || 0;
  $('#sHosp').textContent = stats.hospitalized || 0;
  $('#sHome').textContent = stats.discharged || 0;
  $('#sTransfer').textContent = stats.transferred || 0;
  
  // Calculate average time per patient
  const totalPatients = stats.totalPatients || 0;
  const totalTime = stats.totalTime || 0;
  const avgTimeMinutes = totalPatients > 0 ? Math.round(totalTime / totalPatients) : 0;
  const avgHours = Math.floor(avgTimeMinutes / 60);
  const avgMins = avgTimeMinutes % 60;
  $('#sAvgTime').textContent = `${avgHours}h ${avgMins}m`;
  
  console.log('Stats updated:', stats);
}

async function updateStats(field, value) {
  try {
    const { doc, updateDoc, increment, setDoc, getDoc } = window.firestoreFunctions;
    const statsRef = doc(db, 'users', currentUserId, 'stats', 'main');
    
    try {
      // Try to update existing document
      await updateDoc(statsRef, {
        [field]: increment(value)
      });
    } catch (error) {
      // If document doesn't exist, create it
      const statsDoc = await getDoc(statsRef);
      const initialStats = {
        added: 0,
        hospitalized: 0,
        discharged: 0,
        transferred: 0,
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

async function resetStats() {
  if (!confirm('Êtes-vous sûr de vouloir réinitialiser toutes les statistiques ?')) return;
  
  try {
    const { doc, setDoc } = window.firestoreFunctions;
    
    // Reset main stats
    await setDoc(doc(db, 'users', currentUserId, 'stats', 'main'), {
      added: 0,
      hospitalized: 0,
      discharged: 0,
      transferred: 0,
      totalTime: 0,
      totalPatients: 0
    });
    
    alert('Statistiques réinitialisées!');
    
  } catch (error) {
    console.error('Error resetting stats:', error);
  }
}

// Profile management
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
    
    closeAllModals();
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
  
  ['#currentPin', '#newPin', '#confirmNewPin'].forEach(id => {
    const element = $(id);
    if (element) {
      element.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/[^0-9]/g, '');
      });
    }
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
      
      closeAllModals();
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
    const collections = ['patients', 'stats', 'taskSuggestions', 'phoneBook', 'templates'];
    
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

// Utility functions
function generateId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function getTriageDisplayName(triage) {
  const triageNames = {
    red: 'Rouge',
    orange: 'Orange', 
    yellow: 'Jaune',
    green: 'Vert',
    blue: 'Bleu',
    purple: 'Violet'
  };
  return triageNames[triage] || triage.toUpperCase();
}

function createModal(title, content) {
  closeAllModals();
  
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
  return modal;
}

function closeAllModals() {
  $$('.modal-overlay').forEach(modal => {
    modal.classList.add('hidden');
    setTimeout(() => {
      if (modal.parentNode) {
        modal.parentNode.removeChild(modal);
      }
    }, 300);
  });
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

console.log('FastTrackers script loaded - version française FIXÉE');
