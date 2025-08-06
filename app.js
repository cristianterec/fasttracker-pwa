// FastTrackers PWA - Sliding Panel Version
console.log('FastTrackers loading - version avec panneaux coulissants...');

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
let currentStats = null;
let autoLogoutTimer = null;
const AUTO_LOGOUT_DELAY = 10 * 60 * 1000;
let onboardingStep = 0;

const DEFAULT_SUGGESTIONS = [
  { description: 'Bilan bio', timer: 70 },
  { description: 'Validation senior', timer: 0 },
  { description: 'ECG', timer: 0 },
  { description: 'Imagerie', timer: 0 },
  { description: 'BU', timer: 0 }
];

const ONBOARDING_STEPS = [
  'Ajoutez un patient avec le bouton "Ajouter un patient".',
  'Cliquez sur une carte pour gérer les tâches et les décisions.',
  'Consultez l\'onglet Statistiques pour suivre votre activité.',
  'Transférez des patients avec le bouton "Relève".'
];

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

  applySavedTheme();
  await initializeFirebase();
  setupAuthEventListeners();
  setupAppEventListeners();
  
  console.log('FastTrackers initialized successfully');
}

// Authentication event listeners
function setupAuthEventListeners() {

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

  ['#loginName', '#pinInput'].forEach(id => {
    const el = $(id);
    if (el) {
      el.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleLogin();
      });
    }
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
      createdAt: new Date().toISOString(),
      onboarded: false
    };
    
    await setDoc(doc(db, 'users', userId), userData);
    
    // Initialize user data
    await initializeUserData(userId);
    
    alert('Compte créé avec succès!');
    showLoginForm();

    // Pre-fill login name
    $('#loginName').value = name;
    $('#pinInput').focus();
    
  } catch (error) {
    console.error('Error registering user:', error);
    alert('Erreur lors de la création du compte');
  }
}

// Initialize user data
async function initializeUserData(userId) {
  const { doc, setDoc } = window.firestoreFunctions;
  
  // Initialize stats with proper structure
  await setDoc(doc(db, 'userStats', userId), {
    added: 0,
    completedTasks: 0,
    triageAdded: { red: 0, orange: 0, yellow: 0, green: 0, blue: 0, purple: 0 },
    orientations: {
      hospitalized: { total: 0, red: 0, orange: 0, yellow: 0, green: 0, blue: 0, purple: 0 },
      discharged: { total: 0, red: 0, orange: 0, yellow: 0, green: 0, blue: 0, purple: 0 },
      transferred: { total: 0, red: 0, orange: 0, yellow: 0, green: 0, blue: 0, purple: 0 }
    },
    timePerTriageMinutes: { red: 0, orange: 0, yellow: 0, green: 0, blue: 0, purple: 0 },
    totalTimeMinutes: 0,
    totalPatients: 0,
    lastUpdated: new Date().toISOString()
  });
  
  // Initialize templates
  await setDoc(doc(db, 'userTemplates', userId), {
    hemodynamique: '',
    respiratoire: '',
    digestif: '',
    neurologique: '',
    osteoarticulaire: '',
    autre: '',
    lastUpdated: new Date().toISOString()
  });
  
  // Initialize phone book
  await setDoc(doc(db, 'userPhoneBook', userId), {
    phones: [],
    lastUpdated: new Date().toISOString()
  });
  
}

// Handle user login
async function handleLogin() {
  const name = $('#loginName').value.trim();
  const pin = $('#pinInput').value.trim();

  if (!name || !pin) {
    alert('Veuillez saisir le nom d\'utilisateur et le PIN');
    return;
  }

  try {
    const { collection, query, where, getDocs } = window.firestoreFunctions;
    const snap = await getDocs(query(collection(db, 'users'), where('name', '==', name)));

    if (snap.empty) {
      alert('Utilisateur non trouvé');
      return;
    }

    const userDoc = snap.docs[0];
    const userData = userDoc.data();
    if (userData.pin !== pin) {
      alert('PIN incorrect');
      return;
    }

    // Login successful
    currentUser = userData.name;
    currentUserId = userDoc.id;
    
    $('#username').textContent = currentUser;
    $('#profileName').textContent = currentUser;
    $('#statsUsername').textContent = currentUser;
    
    $('#auth').classList.add('hidden');
    $('#app').classList.remove('hidden');
    
    await startRealtimeListeners();
    startLiveTimers();
    initializePanels();
    setupAutoLogout();

    if (!userData.onboarded) {
      showOnboardingPrompt();
    }

    console.log('Login successful for:', currentUser);
    
  } catch (error) {
    console.error('Login error:', error);
    alert('Erreur de connexion');
  }
}

// Initialize sliding panels
function initializePanels() {
  console.log('Initializing sliding panels...');
  
  // Left panel (phone numbers) button
  $('#leftEdgeBtn').addEventListener('click', () => {
    openLeftPanel();
  });
  
  // Right panel (templates) button
  $('#rightEdgeBtn').addEventListener('click', () => {
    openRightPanel();
  });
  
  // Panel close buttons
  $('#leftPanelClose').addEventListener('click', closeLeftPanel);
  $('#rightPanelClose').addEventListener('click', closeRightPanel);
  
  // Panel overlay
  $('#panelOverlay').addEventListener('click', closePanels);
  
  // Panel content buttons
  $('#addPhoneBtn').addEventListener('click', showAddPhoneForm);
  $('#saveTemplatesBtn').addEventListener('click', saveTemplates);
  
  // Copy buttons for templates
  $$('.copy-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      copyTemplateToClipboard(btn.dataset.field);
    });
  });
  
  // Load initial data
  loadTemplatesData();
  loadPhonesData();
}

// Panel management functions
function openLeftPanel() {
  const panel = $('#leftPanel');
  const overlay = $('#panelOverlay');
  
  panel.classList.add('active');
  overlay.classList.remove('hidden');
  loadPhonesData(); // Refresh data when opening
}

function openRightPanel() {
  const panel = $('#rightPanel');
  const overlay = $('#panelOverlay');
  
  panel.classList.add('active');
  overlay.classList.remove('hidden');
  loadTemplatesData(); // Refresh data when opening
}

function closeLeftPanel() {
  $('#leftPanel').classList.remove('active');
  $('#panelOverlay').classList.add('hidden');
}

function closeRightPanel() {
  $('#rightPanel').classList.remove('active');
  $('#panelOverlay').classList.add('hidden');
}

function closePanels() {
  $$('.sliding-panel').forEach(panel => {
    panel.classList.remove('active');
  });
  $('#panelOverlay').classList.add('hidden');
}

// Load templates data
async function loadTemplatesData() {
  try {
    const { doc, getDoc } = window.firestoreFunctions;
    const templatesDoc = await getDoc(doc(db, 'userTemplates', currentUserId));
    
    if (templatesDoc.exists()) {
      const templates = templatesDoc.data();
      
      $('#templateHemo').value = templates.hemodynamique || '';
      $('#templateResp').value = templates.respiratoire || '';
      $('#templateDig').value = templates.digestif || '';
      $('#templateNeuro').value = templates.neurologique || '';
      $('#templateOsteo').value = templates.osteoarticulaire || '';
      $('#templateAutre').value = templates.autre || '';
    }
  } catch (error) {
    console.error('Error loading templates:', error);
  }
}

// Save templates
async function saveTemplates() {
  try {
    const { doc, setDoc } = window.firestoreFunctions;
    
    const templates = {
      hemodynamique: $('#templateHemo').value.trim(),
      respiratoire: $('#templateResp').value.trim(),
      digestif: $('#templateDig').value.trim(),
      neurologique: $('#templateNeuro').value.trim(),
      osteoarticulaire: $('#templateOsteo').value.trim(),
      autre: $('#templateAutre').value.trim(),
      lastUpdated: new Date().toISOString()
    };
    
    await setDoc(doc(db, 'userTemplates', currentUserId), templates);
    
    // Visual feedback
    const saveBtn = $('#saveTemplatesBtn');
    const originalText = saveBtn.textContent;
    saveBtn.textContent = '✅ Sauvegardé!';
    saveBtn.classList.add('success');
    
    setTimeout(() => {
      saveBtn.textContent = originalText;
      saveBtn.classList.remove('success');
    }, 2000);
    
  } catch (error) {
    console.error('Error saving templates:', error);
    alert('Erreur lors de la sauvegarde');
  }
}

// Copy template to clipboard
async function copyTemplateToClipboard(field) {
  const textarea = $('#' + field);
  const copyBtn = $(`.copy-btn[data-field="${field}"]`);
  
  if (textarea && textarea.value.trim()) {
    try {
      await navigator.clipboard.writeText(textarea.value);
      
      // Visual feedback
      copyBtn.textContent = '✅';
      copyBtn.classList.add('copied');
      
      setTimeout(() => {
        copyBtn.textContent = '📋';
        copyBtn.classList.remove('copied');
      }, 1500);
      
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      textarea.select();
      document.execCommand('copy');
    }
  }
}

// Load phone numbers data
async function loadPhonesData() {
  try {
    const { doc, getDoc } = window.firestoreFunctions;
    const phoneDoc = await getDoc(doc(db, 'userPhoneBook', currentUserId));
    
    const phonesList = $('#phonesList');
    if (!phonesList) return;
    
    if (phoneDoc.exists()) {
      const data = phoneDoc.data();
      const phones = data.phones || [];
      
      if (phones.length === 0) {
        phonesList.innerHTML = '<div class="no-phones">Aucun numéro enregistré</div>';
        return;
      }
      
      phonesList.innerHTML = phones.map((phone, index) => `
        <div class="phone-item" data-index="${index}">
          <div class="phone-info">
            <strong>${phone.name}</strong>
            <span>${phone.number}</span>
          </div>
          <div class="phone-actions">
            <button class="edit-phone-btn" data-index="${index}">✏️</button>
            <button class="delete-phone-btn" data-index="${index}">🗑️</button>
          </div>
        </div>
      `).join('');
      
      // Add event listeners
      $$('.edit-phone-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          editPhone(parseInt(btn.dataset.index));
        });
      });
      
      $$('.delete-phone-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          deletePhone(parseInt(btn.dataset.index));
        });
      });
      
    } else {
      phonesList.innerHTML = '<div class="no-phones">Aucun numéro enregistré</div>';
    }
  } catch (error) {
    console.error('Error loading phones:', error);
  }
}

// Show add phone form
function showAddPhoneForm() {
  const modal = createModal('➕ Ajouter un numéro', `
    <input id="phoneName" placeholder="Nom (ex: Cardiologue)" required>
    <input id="phoneNumber" placeholder="Numéro DECT" required>
    <button class="btn-primary" id="savePhoneBtn">Ajouter</button>
  `);
  
  $('#savePhoneBtn').addEventListener('click', saveNewPhone);
}

// Save new phone number
async function saveNewPhone() {
  const name = $('#phoneName').value.trim();
  const number = $('#phoneNumber').value.trim();
  
  if (!name || !number) {
    alert('Veuillez remplir tous les champs');
    return;
  }
  
  try {
    const { doc, getDoc, setDoc } = window.firestoreFunctions;
    const phoneDocRef = doc(db, 'userPhoneBook', currentUserId);
    const phoneDoc = await getDoc(phoneDocRef);
    
    let phones = [];
    if (phoneDoc.exists()) {
      phones = phoneDoc.data().phones || [];
    }
    
    phones.push({
      id: generateId('phone'),
      name,
      number,
      createdAt: new Date().toISOString()
    });
    
    await setDoc(phoneDocRef, {
      phones,
      lastUpdated: new Date().toISOString()
    });
    
    closeAllModals();
    loadPhonesData(); // Refresh the list
    alert('Numéro ajouté avec succès!');
    
  } catch (error) {
    console.error('Error saving phone:', error);
    alert('Erreur lors de la sauvegarde');
  }
}

// Edit phone number
async function editPhone(index) {
  try {
    const { doc, getDoc } = window.firestoreFunctions;
    const phoneDoc = await getDoc(doc(db, 'userPhoneBook', currentUserId));
    
    if (phoneDoc.exists()) {
      const phones = phoneDoc.data().phones || [];
      const phone = phones[index];
      
      const modal = createModal('✏️ Modifier le numéro', `
        <input id="editPhoneName" placeholder="Nom" value="${phone.name}">
        <input id="editPhoneNumber" placeholder="Numéro" value="${phone.number}">
        <button class="btn-primary" id="updatePhoneBtn">Mettre à jour</button>
      `);
      
      $('#updatePhoneBtn').addEventListener('click', () => updatePhone(index));
    }
  } catch (error) {
    console.error('Error loading phone for edit:', error);
  }
}

// Update phone number
async function updatePhone(index) {
  const name = $('#editPhoneName').value.trim();
  const number = $('#editPhoneNumber').value.trim();
  
  if (!name || !number) {
    alert('Veuillez remplir tous les champs');
    return;
  }
  
  try {
    const { doc, getDoc, setDoc } = window.firestoreFunctions;
    const phoneDocRef = doc(db, 'userPhoneBook', currentUserId);
    const phoneDoc = await getDoc(phoneDocRef);
    
    if (phoneDoc.exists()) {
      const phones = phoneDoc.data().phones || [];
      phones[index] = {
        ...phones[index],
        name,
        number,
        updatedAt: new Date().toISOString()
      };
      
      await setDoc(phoneDocRef, {
        phones,
        lastUpdated: new Date().toISOString()
      });
      
      closeAllModals();
      loadPhonesData(); // Refresh the list
      alert('Numéro modifié avec succès!');
    }
  } catch (error) {
    console.error('Error updating phone:', error);
    alert('Erreur lors de la mise à jour');
  }
}

// Delete phone number
async function deletePhone(index) {
  if (!confirm('Supprimer ce numéro ?')) return;
  
  try {
    const { doc, getDoc, setDoc } = window.firestoreFunctions;
    const phoneDocRef = doc(db, 'userPhoneBook', currentUserId);
    const phoneDoc = await getDoc(phoneDocRef);
    
    if (phoneDoc.exists()) {
      const phones = phoneDoc.data().phones || [];
      const deletedPhone = phones[index];
      phones.splice(index, 1);
      
      await setDoc(phoneDocRef, {
        phones,
        lastUpdated: new Date().toISOString()
      });
      
      loadPhonesData(); // Refresh the list
      alert(`${deletedPhone.name} supprimé avec succès!`);
    }
  } catch (error) {
    console.error('Error deleting phone:', error);
    alert('Erreur lors de la suppression');
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

// Onboarding flow
function showOnboardingPrompt() {
  const prompt = $('#onboardingPrompt');
  if (!prompt) return;
  prompt.classList.remove('hidden');
  $('#startOnboarding').onclick = () => {
    prompt.classList.add('hidden');
    startOnboarding();
  };
  $('#skipOnboarding').onclick = async () => {
    prompt.classList.add('hidden');
    await markOnboardingComplete();
  };
}

function startOnboarding() {
  onboardingStep = 0;
  updateOnboardingContent();
  const modal = $('#onboardingModal');
  modal.classList.remove('hidden');
  $('#nextOnboarding').onclick = advanceOnboarding;
  $('#closeOnboarding').onclick = finishOnboarding;
}

function updateOnboardingContent() {
  $('#onboardingContent').textContent = ONBOARDING_STEPS[onboardingStep];
  const nextBtn = $('#nextOnboarding');
  const closeBtn = $('#closeOnboarding');
  if (onboardingStep >= ONBOARDING_STEPS.length - 1) {
    nextBtn.classList.add('hidden');
    closeBtn.classList.remove('hidden');
  } else {
    nextBtn.classList.remove('hidden');
    closeBtn.classList.add('hidden');
  }
}

function advanceOnboarding() {
  onboardingStep++;
  if (onboardingStep >= ONBOARDING_STEPS.length) {
    finishOnboarding();
  } else {
    updateOnboardingContent();
  }
}

async function finishOnboarding() {
  $('#onboardingModal').classList.add('hidden');
  await markOnboardingComplete();
}

async function markOnboardingComplete() {
  try {
    const { doc, updateDoc } = window.firestoreFunctions;
    await updateDoc(doc(db, 'users', currentUserId), { onboarded: true });
  } catch (err) {
    console.error('Error saving onboarding status:', err);
  }
}

// Start real-time listeners
async function startRealtimeListeners() {
  try {
    const { collection, doc, onSnapshot, orderBy, query, where, limit } = window.firestoreFunctions;
    
    // Patients listener
    const patientsQuery = query(
      collection(db, 'users', currentUserId, 'patients'),
      orderBy('createdAt', 'desc')
    );
    
    unsubscribePatients = onSnapshot(patientsQuery, (snapshot) => {
      renderPatients(snapshot);
    });
    
    // Stats listener for real-time updates
    unsubscribeStats = onSnapshot(doc(db, 'userStats', currentUserId), (doc) => {
      if (doc.exists()) {
        const stats = doc.data();
        updateStatsDisplay(stats);
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

// App event listeners
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

  // Stats reset button
  $('#resetStatsBtn').addEventListener('click', resetUserStats);

  // Theme toggle
  setupThemeToggle();
  
  // Global click delegation
  document.addEventListener('click', globalClickHandler);
  
  // Modal handling
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay') && !e.target.closest('.modal')) {
      e.target.classList.add('hidden');
      if (e.target.parentNode) {
        e.target.parentNode.removeChild(e.target);
      }
    }
    
    if (e.target.matches('.modal-close')) {
      const modal = e.target.closest('.modal-overlay');
      if (modal) {
        modal.classList.add('hidden');
        if (modal.parentNode) {
          modal.parentNode.removeChild(modal);
        }
      }
    }
  });
}

// Statistics Functions
async function updateUserStats(action, timeSpent = 0, triage = null) {
  try {
    const { doc, getDoc, setDoc } = window.firestoreFunctions;
    const statsRef = doc(db, 'userStats', currentUserId);

    const statsDoc = await getDoc(statsRef);
    let stats = {
      added: 0,
      completedTasks: 0,
      triageAdded: { red: 0, orange: 0, yellow: 0, green: 0, blue: 0, purple: 0 },
      orientations: {
        hospitalized: { total: 0, red: 0, orange: 0, yellow: 0, green: 0, blue: 0, purple: 0 },
        discharged: { total: 0, red: 0, orange: 0, yellow: 0, green: 0, blue: 0, purple: 0 },
        transferred: { total: 0, red: 0, orange: 0, yellow: 0, green: 0, blue: 0, purple: 0 }
      },
      timePerTriageMinutes: { red: 0, orange: 0, yellow: 0, green: 0, blue: 0, purple: 0 },
      totalTimeMinutes: 0,
      totalPatients: 0
    };

    if (statsDoc.exists()) {
      const data = statsDoc.data();
      stats = {
        ...stats,
        ...data,
        triageAdded: { ...stats.triageAdded, ...(data.triageAdded || {}) },
        orientations: {
          hospitalized: { ...stats.orientations.hospitalized, ...(data.orientations?.hospitalized || {}) },
          discharged: { ...stats.orientations.discharged, ...(data.orientations?.discharged || {}) },
          transferred: { ...stats.orientations.transferred, ...(data.orientations?.transferred || {}) }
        },
        timePerTriageMinutes: { ...stats.timePerTriageMinutes, ...(data.timePerTriageMinutes || {}) }
      };
    }

    switch (action) {
      case 'added':
        stats.added += 1;
        if (triage) {
          stats.triageAdded[triage] = (stats.triageAdded[triage] || 0) + 1;
        }
        break;
      case 'hospitalized':
      case 'discharged':
      case 'transferred':
        stats.orientations[action].total += 1;
        if (triage) {
          stats.orientations[action][triage] = (stats.orientations[action][triage] || 0) + 1;
          stats.timePerTriageMinutes[triage] = (stats.timePerTriageMinutes[triage] || 0) + timeSpent;
        }
        stats.totalTimeMinutes += timeSpent;
        stats.totalPatients += 1;
        break;
      case 'taskCompleted':
        stats.completedTasks += 1;
        break;
      case 'removed':
        stats.added = Math.max(0, stats.added - 1);
        if (triage && stats.triageAdded[triage] > 0) {
          stats.triageAdded[triage] -= 1;
        }
        break;
    }
    
    stats.lastUpdated = new Date().toISOString();
    
    // Save updated stats
    await setDoc(statsRef, stats);

    console.log('Stats updated:', action, stats);
    
  } catch (error) {
    console.error('Error updating user stats:', error);
  }
}


// Update stats display
function updateStatsDisplay(stats) {
  const statAdded = $('#statAdded');
  const statAvgTime = $('#statAvgTime');
  const statCompleted = $('#statCompleted');

  const hospTotal = $('#statHospitalizedTotal');
  const disTotal = $('#statDischargedTotal');
  const transTotal = $('#statTransferredTotal');
  const hospRed = $('#statHospRed');
  const hospOrange = $('#statHospOrange');
  const hospYellow = $('#statHospYellow');
  const hospGreen = $('#statHospGreen');
  const hospBlue = $('#statHospBlue');
  const hospPurple = $('#statHospPurple');
  const disRed = $('#statDisRed');
  const disOrange = $('#statDisOrange');
  const disYellow = $('#statDisYellow');
  const disGreen = $('#statDisGreen');
  const disBlue = $('#statDisBlue');
  const disPurple = $('#statDisPurple');
  const transRed = $('#statTransRed');
  const transOrange = $('#statTransOrange');
  const transYellow = $('#statTransYellow');
  const transGreen = $('#statTransGreen');
  const transBlue = $('#statTransBlue');
  const transPurple = $('#statTransPurple');

  const orientations = stats.orientations || { hospitalized: {}, discharged: {}, transferred: {} };

  if (statAdded) statAdded.textContent = stats.added || 0;


  if (hospTotal) hospTotal.textContent = orientations.hospitalized.total || 0;
  if (disTotal) disTotal.textContent = orientations.discharged.total || 0;
  if (transTotal) transTotal.textContent = orientations.transferred.total || 0;

  if (hospRed) hospRed.textContent = orientations.hospitalized.red || 0;
  if (hospOrange) hospOrange.textContent = orientations.hospitalized.orange || 0;
  if (hospYellow) hospYellow.textContent = orientations.hospitalized.yellow || 0;
  if (hospGreen) hospGreen.textContent = orientations.hospitalized.green || 0;
  if (hospBlue) hospBlue.textContent = orientations.hospitalized.blue || 0;
  if (hospPurple) hospPurple.textContent = orientations.hospitalized.purple || 0;

  if (disRed) disRed.textContent = orientations.discharged.red || 0;
  if (disOrange) disOrange.textContent = orientations.discharged.orange || 0;
  if (disYellow) disYellow.textContent = orientations.discharged.yellow || 0;
  if (disGreen) disGreen.textContent = orientations.discharged.green || 0;
  if (disBlue) disBlue.textContent = orientations.discharged.blue || 0;
  if (disPurple) disPurple.textContent = orientations.discharged.purple || 0;

  if (transRed) transRed.textContent = orientations.transferred.red || 0;
  if (transOrange) transOrange.textContent = orientations.transferred.orange || 0;
  if (transYellow) transYellow.textContent = orientations.transferred.yellow || 0;
  if (transGreen) transGreen.textContent = orientations.transferred.green || 0;
  if (transBlue) transBlue.textContent = orientations.transferred.blue || 0;
  if (transPurple) transPurple.textContent = orientations.transferred.purple || 0;

  const totalPatients = stats.totalPatients || 0;
  const totalTimeMinutes = stats.totalTimeMinutes || 0;

  if (totalPatients > 0 && statAvgTime) {
    const avgTimeMinutes = Math.round(totalTimeMinutes / totalPatients);
    const hours = Math.floor(avgTimeMinutes / 60);
    const minutes = avgTimeMinutes % 60;
    statAvgTime.textContent = `${hours}h ${minutes}m`;
  } else if (statAvgTime) {
    statAvgTime.textContent = '0h 0m';
  }


  if (statCompleted) statCompleted.textContent = stats.completedTasks || 0;

  currentStats = stats;
}


// Reset user statistics
async function resetUserStats() {
  if (!confirm('Êtes-vous sûr de vouloir réinitialiser toutes vos statistiques ? Cette action est irréversible.')) {
    return;
  }
  
  try {
    const { doc, setDoc } = window.firestoreFunctions;
    
    const resetStats = {
      added: 0,
      completedTasks: 0,
      triageAdded: { red: 0, orange: 0, yellow: 0, green: 0, blue: 0, purple: 0 },
      orientations: {
        hospitalized: { total: 0, red: 0, orange: 0, yellow: 0, green: 0, blue: 0, purple: 0 },
        discharged: { total: 0, red: 0, orange: 0, yellow: 0, green: 0, blue: 0, purple: 0 },
        transferred: { total: 0, red: 0, orange: 0, yellow: 0, green: 0, blue: 0, purple: 0 }
      },
      timePerTriageMinutes: { red: 0, orange: 0, yellow: 0, green: 0, blue: 0, purple: 0 },
      totalTimeMinutes: 0,
      totalPatients: 0,
      lastUpdated: new Date().toISOString(),
      resetAt: new Date().toISOString()
    };
    
    await setDoc(doc(db, 'userStats', currentUserId), resetStats);

    alert('Statistiques réinitialisées avec succès!');
    
  } catch (error) {
    console.error('Error resetting stats:', error);
    alert('Erreur lors de la réinitialisation');
  }
}

// Theme handling
function applySavedTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  document.body.classList.toggle('light-mode', saved === 'light');
  updateThemeColorMeta();
}

function setupThemeToggle() {
  const toggle = $('#themeToggle');
  if (!toggle) return;
  applySavedTheme();
  toggle.checked = document.body.classList.contains('light-mode');
  toggle.addEventListener('change', () => {
    const light = toggle.checked;
    document.body.classList.toggle('light-mode', light);
    localStorage.setItem('theme', light ? 'light' : 'dark');
    updateThemeColorMeta();
  });
}

function updateThemeColorMeta() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const color = getComputedStyle(document.body).getPropertyValue('--bg-primary');
    meta.setAttribute('content', color.trim());
  }
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

  // Edit task
  if (e.target.closest('.task') && !e.target.closest('button')) {
    const taskEl = e.target.closest('.task');
    if (!taskEl.classList.contains('completed')) {
      const pid = taskEl.dataset.pid;
      const tid = taskEl.dataset.tid;
      if (pid && tid) {
        e.preventDefault();
        showEditTaskModal(pid, tid);
        return;
      }
    }
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
    e.target.classList.toggle('selected');
    return;
  }
}

// Logout
function logout() {
  if (unsubscribePatients) unsubscribePatients();
  if (unsubscribeStats) unsubscribeStats();
  if (unsubscribeTransfers) unsubscribeTransfers();
  stopLiveTimers();
  clearAutoLogout();

  currentUser = null;
  currentUserId = null;
  
  $('#auth').classList.remove('hidden');
  $('#app').classList.add('hidden');
  
  // Reset forms
  $('#loginName').value = '';
  $('#pinInput').value = '';
  showLoginForm();
}

function setupAutoLogout() {
  ['click', 'mousemove', 'keydown', 'touchstart'].forEach(evt => {
    document.addEventListener(evt, resetAutoLogoutTimer, { passive: true });
  });
  resetAutoLogoutTimer();
}

function resetAutoLogoutTimer() {
  clearTimeout(autoLogoutTimer);
  autoLogoutTimer = setTimeout(() => {
    alert('Déconnexion automatique pour inactivité');
    logout();
  }, AUTO_LOGOUT_DELAY);
}

function clearAutoLogout() {
  ['click', 'mousemove', 'keydown', 'touchstart'].forEach(evt => {
    document.removeEventListener(evt, resetAutoLogoutTimer);
  });
  clearTimeout(autoLogoutTimer);
  autoLogoutTimer = null;
}

// Tab switching
function switchTab(tabName) {
  $$('.tab').forEach(tab => tab.classList.remove('active'));
  const targetTab = $(`[data-tab="${tabName}"]`);
  if (targetTab) targetTab.classList.add('active');
  
  $$('.tab-content').forEach(content => content.classList.add('hidden'));
  const targetContent = $(`#${tabName}`);
  if (targetContent) targetContent.classList.remove('hidden');
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
      if (!el.classList.contains('expired')) {
        el.classList.add('expired');
      }
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

  if (currentStats) {
    const timers = $$('.live-timer');
    let activeMinutes = 0;
    timers.forEach(el => {
      const createdAt = new Date(el.dataset.created).getTime();
      activeMinutes += (now - createdAt) / 60000;
    });

    const totalMinutes = (currentStats.totalTimeMinutes || 0) + activeMinutes;
    const totalPatients = (currentStats.totalPatients || 0) + timers.length;
    const statAvgTime = $('#statAvgTime');
    if (statAvgTime && totalPatients > 0) {
      const avg = Math.round(totalMinutes / totalPatients);
      const h = Math.floor(avg / 60);
      const m = avg % 60;
      statAvgTime.textContent = `${h}h ${m}m`;
    }
  }
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
  const addBtn = $('#addPatient');

  grid.innerHTML = '';

  if (snapshot.empty) {
    grid.appendChild(addBtn);
    return;
  }
  
  const patients = [];
  snapshot.forEach(doc => {
    patients.push(doc.data());
  });
  
  const triagePriority = { red: 1, orange: 2, yellow: 3, green: 4, blue: 5, purple: 6 };
  patients.sort((a, b) => (triagePriority[a.triage] || 6) - (triagePriority[b.triage] || 6));
  
  grid.innerHTML = patients.map(patient => createPatientCardHTML(patient)).join('');
  grid.appendChild(addBtn);
}

function createPatientCardHTML(patient) {
  const tasks = patient.tasks || [];
  const hasNotes = !!(patient.notes && patient.notes.trim());
  const hasTasks = tasks.length > 0;
  const cardClasses = `${patient.triage} ${hasNotes ? '' : 'no-notes'} ${hasTasks ? 'has-tasks' : 'no-tasks'}`.trim();
  
  // Patient notes display
  const notesDisplay = patient.notes && patient.notes.trim() ? 
    `<div class="patient-notes">
      <span class="objective-emoji">🎯</span>
      <div class="notes-text">${patient.notes}</div>
    </div>` : '';
  
  return `
    <div class="card ${cardClasses}" data-patient-id="${patient.id}">
      <!-- Live timer -->
      <div class="live-timer" data-created="${patient.createdAt}">
        ${formatElapsedTime(Date.now() - new Date(patient.createdAt).getTime())}
      </div>
      
      <div class="info-box">
        <div>📍 ${patient.location || '—'}</div>
        <div>📱 ${patient.nurse || '—'}</div>
      </div>
      
      <div class="patient-main">
        <div class="patient-name">${patient.name}</div>
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
    <div class="task ${isCompleted ? 'completed' : ''}" data-pid="${patientId}" data-tid="${task.id}">
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
    
    // Update stats immediately
    await updateUserStats('added', 0, selectedTriage.dataset.triage);
    
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
function loadTaskSuggestions() {
  const container = $('#suggestionChips');
  if (container) {
    container.innerHTML = DEFAULT_SUGGESTIONS.map(s =>
      `<div class="suggestion-chip" data-description="${s.description}" data-timer="${s.timer}">
        ${s.description}${s.timer > 0 ? ` (${s.timer}min)` : ''}
      </div>`
    ).join('');
  }
}

// Save task
async function saveTask(patientId) {
  const description = $('#taskDescription').value.trim();
  const minutes = parseInt($('#taskMinutes').value) || 0;
  
  const chips = $$('#suggestionChips .suggestion-chip.selected');

  if (!description && chips.length === 0) {
    alert('Veuillez saisir une description ou sélectionner une suggestion');
    return;
  }

  const tasksToAdd = [];

  if (description) {
    tasksToAdd.push({
      id: generateId('task'),
      description,
      dueAt: minutes > 0 ? new Date(Date.now() + minutes * 60000).toISOString() : null,
      completed: false,
      createdAt: new Date().toISOString()
    });
  }

  chips.forEach(chip => {
    const desc = chip.dataset.description;
    const t = parseInt(chip.dataset.timer) || 0;
    tasksToAdd.push({
      id: generateId('task'),
      description: desc,
      dueAt: t > 0 ? new Date(Date.now() + t * 60000).toISOString() : null,
      completed: false,
      createdAt: new Date().toISOString()
    });
  });
  
  try {
    const { doc, getDoc, updateDoc } = window.firestoreFunctions;
    const patientRef = doc(db, 'users', currentUserId, 'patients', patientId);
    const patientSnap = await getDoc(patientRef);
    
    if (patientSnap.exists()) {
      const patientData = patientSnap.data();
      const updatedTasks = [...(patientData.tasks || []), ...tasksToAdd];
      await updateDoc(patientRef, { tasks: updatedTasks });
    }
    
    closeAllModals();
    
  } catch (error) {
    console.error('Error adding task:', error);
    alert('Erreur lors de l\'ajout de la tâche');
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
      await updateUserStats('taskCompleted');
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

// Show edit task modal
async function showEditTaskModal(patientId, taskId) {
  try {
    const { doc, getDoc } = window.firestoreFunctions;
    const patientRef = doc(db, 'users', currentUserId, 'patients', patientId);
    const snap = await getDoc(patientRef);

    if (!snap.exists()) return;
    const patient = snap.data();
    const task = (patient.tasks || []).find(t => t.id === taskId);
    if (!task || task.completed) return;

    const remaining = task.dueAt ? Math.max(0, Math.ceil((new Date(task.dueAt) - Date.now()) / 60000)) : '';

    const modal = createModal('✏️ Modifier la tâche', `
      <input id="editTaskDesc" value="${task.description}" placeholder="Description de la tâche" required>
      <input id="editTaskMinutes" type="number" placeholder="⏰ Délai en minutes (optionnel)" min="1" max="1440" value="${remaining}">
      <button class="btn-primary" id="updateTask">Mettre à jour</button>
    `);

    $('#updateTask').addEventListener('click', () => updateTask(patientId, taskId));

  } catch (error) {
    console.error('Error loading task for edit:', error);
  }
}

// Update task
async function updateTask(patientId, taskId) {
  const description = $('#editTaskDesc').value.trim();
  const minutes = parseInt($('#editTaskMinutes').value) || 0;

  if (!description) {
    alert('Veuillez saisir une description');
    return;
  }

  try {
    const { doc, getDoc, updateDoc } = window.firestoreFunctions;
    const patientRef = doc(db, 'users', currentUserId, 'patients', patientId);
    const snap = await getDoc(patientRef);

    if (snap.exists()) {
      const patientData = snap.data();
      const updatedTasks = patientData.tasks.map(task => {
        if (task.id === taskId) {
          return {
            ...task,
            description,
            dueAt: minutes > 0 ? new Date(Date.now() + minutes * 60000).toISOString() : null
          };
        }
        return task;
      });

      await updateDoc(patientRef, { tasks: updatedTasks });
    }

    closeAllModals();

  } catch (error) {
    console.error('Error updating task:', error);
    alert('Erreur lors de la mise à jour de la tâche');
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

// Handle patient decision - WITH STATS TRACKING
async function handlePatientDecision(patientId, action) {
  try {
    const { doc, getDoc, deleteDoc } = window.firestoreFunctions;
    
    // Get patient data for time calculation
    const patientSnap = await getDoc(doc(db, 'users', currentUserId, 'patients', patientId));
    let timeSpentMinutes = 0;
    let patientData = null;
    
    if (patientSnap.exists()) {
      patientData = patientSnap.data();
      const createdAt = new Date(patientData.createdAt);
      const now = new Date();
      timeSpentMinutes = Math.floor((now - createdAt) / 60000); // minutes
    }
    
    await deleteDoc(doc(db, 'users', currentUserId, 'patients', patientId));

    if (action === 'delete' && patientData) {
      await updateUserStats('removed', 0, patientData.triage);
    } else if (patientData) {
      let statsAction = action;
      if (action === 'discharge') {
        statsAction = 'discharged';
      } else if (action === 'hospitalize') {
        statsAction = 'hospitalized';
      } else if (action === 'transfer') {
        statsAction = 'transferred';
      }
      await updateUserStats(statsAction, timeSpentMinutes, patientData.triage);
    }
    
    $$('.floating-menu').forEach(menu => menu.remove());
    
  } catch (error) {
    console.error('Error handling patient decision:', error);
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
    
    // Collect patient data and track stats
    const patientsData = [];
    for (const patientId of selectedPatients) {
      const patientSnap = await getDoc(doc(db, 'users', currentUserId, 'patients', patientId));
      if (patientSnap.exists()) {
        const patient = patientSnap.data();
        patientsData.push(patient);

        const createdAt = new Date(patient.createdAt);
        const now = new Date();
        const timeSpentMinutes = Math.floor((now - createdAt) / 60000);
        await updateUserStats('transferred', timeSpentMinutes, patient.triage);
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
    $('#statsUsername').textContent = newName;
    
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
    const collections = ['patients', 'taskSuggestions'];
    
    for (const collectionName of collections) {
      const snapshot = await getDocs(collection(db, 'users', currentUserId, collectionName));
      const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
    }
    
    // Delete user documents
    await deleteDoc(doc(db, 'users', currentUserId));
    await deleteDoc(doc(db, 'userStats', currentUserId));
    await deleteDoc(doc(db, 'userTemplates', currentUserId));
    await deleteDoc(doc(db, 'userPhoneBook', currentUserId));
    
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
    if (modal.parentNode) {
      modal.parentNode.removeChild(modal);
    }
  });
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

console.log('FastTrackers script loaded - version avec panneaux coulissants COMPLÈTE');
