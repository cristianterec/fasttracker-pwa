// FastTrackers PWA - Sliding Panel Version with Username Authentication
console.log('FastTrackers loading - version avec panneaux coulissants et authentification par username...');

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
    setupAuthEventListeners();
    setupAppEventListeners();
    console.log('FastTrackers initialized successfully');
}

/* ----------  OLD global DOM helpers remain ---------- */
const $ = sel => document.querySelector(sel);

/* ---------- 1. AUTH FORM EVENTS --------------------- */
function setupAuthEventListeners() {
  // numeric-only for PIN fields
  ['#loginPin', '#registerPin', '#confirmPin'].forEach(id => {
    $(id).addEventListener('input', e =>
      e.target.value = e.target.value.replace(/[^0-9]/g,'')
    );
  });

  $('#loginBtn')      .addEventListener('click', handleLogin);
  $('#registerBtn')   .addEventListener('click', handleRegister);
  $('#showRegisterBtn').addEventListener('click', showRegisterForm);
  $('#showLoginBtn')   .addEventListener('click', showLoginForm);

  // Enter key shortcuts
  ['#loginUsername','#loginPin'].forEach(id=>{
    $(id).addEventListener('keypress',e=>{
      if(e.key==='Enter') handleLogin();
    });
  });
}

/* ---------- 2.  LOGIN  ------------------------------ */
async function handleLogin() {
  const username = $('#loginUsername').value.trim();
  const pin      = $('#loginPin').value.trim();

  if(!username || !pin){
    alert('Entrez nom d’utilisateur et PIN');
    return;
  }

  try{
    const { collection, query, where, getDocs } = window.firestoreFunctions;
    const q = query(collection(db,'users'), where('name','==',username));
    const snap = await getDocs(q);

    if (snap.empty){
      alert('Utilisateur introuvable');
      return;
    }
    const docData = snap.docs[0].data();
    if (docData.pin !== pin){
      alert('PIN incorrect');
      return;
    }

    // success : save user id / name
    currentUserId = snap.docs[0].id;
    currentUser   = docData.name;
    afterSuccessfulAuth();
  }
  catch(err){ console.error(err); alert('Erreur de connexion'); }
}

/* ---------- 3.  REGISTER  --------------------------- */
async function handleRegister(){
  const username  = $('#registerUsername').value.trim();
  const pin1      = $('#registerPin').value.trim();
  const pin2      = $('#confirmPin').value.trim();

  if(!username || !pin1 || !pin2){
    alert('Tous les champs sont requis'); return;
  }
  if(pin1.length!==4){ alert('PIN = 4 chiffres'); return;}
  if(pin1!==pin2){ alert('Les PIN ne correspondent pas'); return;}

  try{
    const { collection, query, where, getDocs, doc, setDoc } = window.firestoreFunctions;

    // ensure uniqueness
    const exists = await getDocs(query(collection(db,'users'),
                                       where('name','==',username)));
    if(!exists.empty){
      alert('Nom d’utilisateur déjà pris'); return;
    }

    const userId = 'user_' + Date.now() + '_' +
                   Math.random().toString(36).slice(2,9);

    await setDoc(doc(db,'users',userId),{
      id:userId, name:username, pin:pin1,
      createdAt: new Date().toISOString()
    });

    await initializeUserData(userId);
    alert('Compte créé ! Connectez-vous.');
    showLoginForm();
    $('#loginUsername').value = username;
    $('#loginPin').focus();
  }
  catch(err){ console.error(err); alert('Erreur d’inscription'); }
}

/* ---------- 4.  AFTER LOGIN HELPERS ----------------- */
function afterSuccessfulAuth(){
  $('#username').textContent = currentUser;
  $('#profileName').textContent = currentUser;
  $('#statsUsername').textContent = currentUser;

  $('#auth').classList.add('hidden');
  $('#app').classList.remove('hidden');

  startRealtimeListeners()
    .then(checkForTransfers)
    .then(startLiveTimers)
    .then(initializePanels);

  console.log('Logged in as',currentUser);
}

/* ---------- 5.  REMOVE OLD  DROPDOWN  --------------- */
/* Delete code that loaded users into #userSelect and
   all listeners/DOM for that <select>.  All functions
   interacting with #userSelect (loadUsers, etc.) can
   be safely removed.                                    */


// Initialize user data
async function initializeUserData(userId) {
    const { doc, setDoc } = window.firestoreFunctions;
    
    // Initialize stats with proper structure
    await setDoc(doc(db, 'userStats', userId), {
        added: 0,
        hospitalized: 0,
        discharged: 0,
        transferred: 0,
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

    // Initialize task suggestions
    await setDoc(doc(db, 'users', userId, 'taskSuggestions', 'main'), {
        suggestions: [
            { description: "Senior", timer: 0, frequency: 1 },
            { description: "Bilan bio", timer: 70, frequency: 1 },
            { description: "ECG", timer: 0, frequency: 1 },
            { description: "BU", timer: 0, frequency: 1 }
        ]
    });
}

// Handle user login


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
            
            phonesList.innerHTML = phones.map(phone => `
                <div class="phone-item">
                    <div class="phone-info">
                        <strong>${phone.name}</strong>
                        <span>${phone.number}</span>
                    </div>
                    <div class="phone-actions">
                        <button class="edit-phone-btn" onclick="editPhone('${phone.id}')">✏️</button>
                        <button class="delete-phone-btn" onclick="deletePhone('${phone.id}')">🗑️</button>
                    </div>
                </div>
            `).join('');
        } else {
            phonesList.innerHTML = '<div class="no-phones">Aucun numéro enregistré</div>';
        }
    } catch (error) {
        console.error('Error loading phone numbers:', error);
    }
}

// Show add phone form
function showAddPhoneForm() {
    const name = prompt('Nom du contact:');
    if (!name) return;
    
    const number = prompt('Numéro de téléphone:');
    if (!number) return;
    
    addPhone(name.trim(), number.trim());
}

// Add phone number
async function addPhone(name, number) {
    try {
        const { doc, getDoc, setDoc } = window.firestoreFunctions;
        const phoneDoc = await getDoc(doc(db, 'userPhoneBook', currentUserId));
        
        let phones = [];
        if (phoneDoc.exists()) {
            phones = phoneDoc.data().phones || [];
        }
        
        const newPhone = {
            id: Date.now().toString(),
            name: name,
            number: number,
            createdAt: new Date().toISOString()
        };
        
        phones.push(newPhone);
        
        await setDoc(doc(db, 'userPhoneBook', currentUserId), {
            phones: phones,
            lastUpdated: new Date().toISOString()
        });
        
        loadPhonesData(); // Refresh the list
        
    } catch (error) {
        console.error('Error adding phone:', error);
        alert('Erreur lors de l\'ajout du numéro');
    }
}

// Edit phone number
async function editPhone(phoneId) {
    try {
        const { doc, getDoc, setDoc } = window.firestoreFunctions;
        const phoneDoc = await getDoc(doc(db, 'userPhoneBook', currentUserId));
        
        if (!phoneDoc.exists()) return;
        
        const phones = phoneDoc.data().phones || [];
        const phoneIndex = phones.findIndex(p => p.id === phoneId);
        
        if (phoneIndex === -1) return;
        
        const phone = phones[phoneIndex];
        const newName = prompt('Nouveau nom:', phone.name);
        if (!newName) return;
        
        const newNumber = prompt('Nouveau numéro:', phone.number);
        if (!newNumber) return;
        
        phones[phoneIndex] = {
            ...phone,
            name: newName.trim(),
            number: newNumber.trim(),
            updatedAt: new Date().toISOString()
        };
        
        await setDoc(doc(db, 'userPhoneBook', currentUserId), {
            phones: phones,
            lastUpdated: new Date().toISOString()
        });
        
        loadPhonesData(); // Refresh the list
        
    } catch (error) {
        console.error('Error editing phone:', error);
        alert('Erreur lors de la modification');
    }
}

// Delete phone number
async function deletePhone(phoneId) {
    if (!confirm('Supprimer ce numéro ?')) return;
    
    try {
        const { doc, getDoc, setDoc } = window.firestoreFunctions;
        const phoneDoc = await getDoc(doc(db, 'userPhoneBook', currentUserId));
        
        if (!phoneDoc.exists()) return;
        
        const phones = phoneDoc.data().phones || [];
        const filteredPhones = phones.filter(p => p.id !== phoneId);
        
        await setDoc(doc(db, 'userPhoneBook', currentUserId), {
            phones: filteredPhones,
            lastUpdated: new Date().toISOString()
        });
        
        loadPhonesData(); // Refresh the list
        
    } catch (error) {
        console.error('Error deleting phone:', error);
        alert('Erreur lors de la suppression');
    }
}

// Setup app event listeners
function setupAppEventListeners() {
    // Tab switching
    $$('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            switchTab(tabName);
        });
    });

    // Profile button
    $('#usernameBtn').addEventListener('click', () => {
        switchTab('profile');
    });

    // Logout
    $('#logout').addEventListener('click', logout);

    // Add patient
    $('#addPatient').addEventListener('click', showAddPatientModal);

    // Transfer button
    $('#transferBtn').addEventListener('click', showTransferModal);

    // Reset stats
    $('#resetStatsBtn').addEventListener('click', resetStats);
}

// Switch tabs
function switchTab(tabName) {
    // Update tab buttons
    $$('.tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // Update tab content
    $$('.tab-content').forEach(content => {
        content.classList.toggle('hidden', content.id !== tabName);
    });

    // Special handling for profile tab
    if (tabName === 'profile') {
        // Make sure profile tab button is active
        $$('.tab').forEach(tab => {
            tab.classList.remove('active');
        });
    }
}

// Logout function
function logout() {
    currentUser = null;
    currentUserId = null;

    // Clear auth inputs
    const fields = ['#loginUsername','#loginPin','#registerUsername','#registerPin','#confirmPin'];
    fields.forEach(id => { const el = document.querySelector(id); if (el) el.value=''; });

    // stop listeners
    if (unsubscribePatients)  unsubscribePatients();
    if (unsubscribeStats)     unsubscribeStats();
    if (unsubscribeTransfers) unsubscribeTransfers();

    // show auth screen again
    document.getElementById('app').classList.add('hidden');
    document.getElementById('auth').classList.remove('hidden');
    showLoginForm();
}


// Start realtime listeners
async function startRealtimeListeners() {
    try {
        const { collection, onSnapshot, query, where } = window.firestoreFunctions;
        
        // Listen to patients
        unsubscribePatients = onSnapshot(
            collection(db, 'users', currentUserId, 'patients'), 
            (snapshot) => {
                const patients = [];
                snapshot.forEach(doc => {
                    patients.push({ id: doc.id, ...doc.data() });
                });
                updatePatientsDisplay(patients);
            }
        );
        
        // Listen to stats
        unsubscribeStats = onSnapshot(
            collection(db, 'userStats').where('id', '==', currentUserId),
            (snapshot) => {
                snapshot.forEach(doc => {
                    updateStatsDisplay(doc.data());
                });
            }
        );
        
        // Listen to transfers
        unsubscribeTransfers = onSnapshot(
            query(collection(db, 'transfers'), where('toUserId', '==', currentUserId), where('status', '==', 'pending')),
            (snapshot) => {
                if (!snapshot.empty) {
                    handleIncomingTransfer(snapshot.docs[0]);
                }
            }
        );
        
    } catch (error) {
        console.error('Error starting listeners:', error);
    }
}

// Update patients display
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
    
    grid.innerHTML = patients.map(patient => createPatientCard(patient)).join('');
}

// Create patient card HTML
function createPatientCard(patient) {
    const timeElapsed = calculateTimeElapsed(patient.createdAt);
    const tasks = patient.tasks || [];
    const activeTasks = tasks.filter(t => !t.completed);
    const completedTasks = tasks.filter(t => t.completed);
    
    return `
        <div class="card ${patient.triage}" data-patient-id="${patient.id}">
            <div class="info-box">
                👤 ${patient.age}ans ${patient.gender === 'M' ? '♂️' : '♀️'}
            </div>
            
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
                <div class="patient-notes" id="notes-${patient.id}" style="display: none;">
                    📝 ${patient.notes}
                </div>
            ` : ''}
            
            <div class="tasks">
                ${activeTasks.map(task => `
                    <div class="task" data-task-id="${task.id}">
                        <div class="task-content">
                            <span class="task-desc">${task.description}</span>
                            ${task.timer > 0 ? `<span class="task-timer ${isTaskExpired(task) ? 'expired' : ''}">${formatTimer(task.timer)}</span>` : ''}
                        </div>
                        <div class="task-actions">
                            <button class="task-check" onclick="completeTask('${patient.id}', '${task.id}')">✓</button>
                            <button class="task-delete" onclick="deleteTask('${patient.id}', '${task.id}')">✗</button>
                        </div>
                    </div>
                `).join('')}
                
                ${completedTasks.map(task => `
                    <div class="task completed" data-task-id="${task.id}">
                        <div class="task-content">
                            <span class="task-desc">${task.description}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
            
            <div class="actions">
                <button class="btn task" onclick="showAddTaskModal('${patient.id}')">➕ Tâche</button>
                <button class="btn decision" onclick="showDecisionMenu('${patient.id}', event)">⚡ Décision</button>
            </div>
        </div>
    `;
}

// Calculate time elapsed
function calculateTimeElapsed(createdAt) {
    const now = new Date();
    const created = new Date(createdAt);
    const diff = now - created;
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    return `${hours}h ${minutes}m`;
}

// Format timer
function formatTimer(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

// Check if task is expired
function isTaskExpired(task) {
    if (!task.createdAt || task.timer <= 0) return false;
    
    const now = new Date();
    const created = new Date(task.createdAt);
    const elapsed = (now - created) / (1000 * 60); // minutes
    
    return elapsed > task.timer;
}

// Start live timers
function startLiveTimers() {
    liveTimerHandle = setInterval(() => {
        $$('.live-timer').forEach(timer => {
            const createdAt = timer.dataset.createdAt;
            if (createdAt) {
                timer.textContent = calculateTimeElapsed(createdAt);
            }
        });
    }, 60000); // Update every minute
}

// Update stats display
function updateStatsDisplay(stats) {
    $('#statAdded').textContent = stats.added || 0;
    $('#statHospitalized').textContent = stats.hospitalized || 0;
    $('#statDischarged').textContent = stats.discharged || 0;
    $('#statTransferred').textContent = stats.transferred || 0;
    
    // Calculate average time
    const avgMinutes = stats.totalPatients > 0 ? stats.totalTimeMinutes / stats.totalPatients : 0;
    const avgHours = Math.floor(avgMinutes / 60);
    const avgMins = Math.round(avgMinutes % 60);
    $('#statAvgTime').textContent = `${avgHours}h ${avgMins}m`;
}

// Show add patient modal
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
            <div class="triage-circle red" data-triage="red"></div>
            <div class="triage-circle orange" data-triage="orange"></div>
            <div class="triage-circle yellow" data-triage="yellow"></div>
            <div class="triage-circle green" data-triage="green"></div>
            <div class="triage-circle blue" data-triage="blue"></div>
            <div class="triage-circle purple" data-triage="purple"></div>
        </div>
        
        <button class="btn-primary" onclick="addPatient()">Ajouter le patient</button>
    `);
    
    // Triage selection
    $$('.triage-circle').forEach(circle => {
        circle.addEventListener('click', () => {
            $$('.triage-circle').forEach(c => c.classList.remove('selected'));
            circle.classList.add('selected');
        });
    });
}

// Add patient
async function addPatient() {
    const name = $('#patientName').value.trim();
    const age = parseInt($('#patientAge').value);
    const gender = $('#patientGender').value;
    const complaint = $('#patientComplaint').value.trim();
    const notes = $('#patientNotes').value.trim();
    const selectedTriage = $('.triage-circle.selected');
    
    if (!name || !age || !gender || !complaint || !selectedTriage) {
        alert('Veuillez remplir tous les champs obligatoires et sélectionner un triage');
        return;
    }
    
    try {
        const { doc, setDoc, getDoc, updateDoc, increment } = window.firestoreFunctions;
        
        const patientId = 'patient_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        const patientData = {
            id: patientId,
            name: name,
            age: age,
            gender: gender,
            complaint: complaint,
            notes: notes,
            triage: selectedTriage.dataset.triage,
            createdAt: new Date().toISOString(),
            tasks: []
        };
        
        await setDoc(doc(db, 'users', currentUserId, 'patients', patientId), patientData);
        
        // Update stats
        await updateDoc(doc(db, 'userStats', currentUserId), {
            added: increment(1),
            lastUpdated: new Date().toISOString()
        });
        
        closeModal();
        
    } catch (error) {
        console.error('Error adding patient:', error);
        alert('Erreur lors de l\'ajout du patient');
    }
}

// Create modal
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

// Close modal
function closeModal() {
    const modal = $('.modal-overlay');
    if (modal) {
        modal.remove();
    }
}

// Toggle patient notes
function toggleNotes(patientId) {
    const notes = $(`#notes-${patientId}`);
    if (notes) {
        notes.style.display = notes.style.display === 'none' ? 'block' : 'none';
    }
}

// Show add task modal
function showAddTaskModal(patientId) {
    createModal('Ajouter une tâche', `
        <input type="text" id="taskDescription" placeholder="Description de la tâche" required>
        <input type="number" id="taskTimer" placeholder="Minuteur (minutes, 0 = pas de minuteur)" min="0" value="0">
        <button class="btn-primary" onclick="addTask('${patientId}')">Ajouter la tâche</button>
    `);
}

// Add task
async function addTask(patientId) {
    const description = $('#taskDescription').value.trim();
    const timer = parseInt($('#taskTimer').value) || 0;
    
    if (!description) {
        alert('Veuillez saisir une description');
        return;
    }
    
    try {
        const { doc, getDoc, updateDoc } = window.firestoreFunctions;
        
        const patientDoc = await getDoc(doc(db, 'users', currentUserId, 'patients', patientId));
        if (!patientDoc.exists()) return;
        
        const patient = patientDoc.data();
        const tasks = patient.tasks || [];
        
        const newTask = {
            id: Date.now().toString(),
            description: description,
            timer: timer,
            completed: false,
            createdAt: new Date().toISOString()
        };
        
        tasks.push(newTask);
        
        await updateDoc(doc(db, 'users', currentUserId, 'patients', patientId), {
            tasks: tasks
        });
        
        closeModal();
        
    } catch (error) {
        console.error('Error adding task:', error);
        alert('Erreur lors de l\'ajout de la tâche');
    }
}

// Complete task
async function completeTask(patientId, taskId) {
    try {
        const { doc, getDoc, updateDoc } = window.firestoreFunctions;
        
        const patientDoc = await getDoc(doc(db, 'users', currentUserId, 'patients', patientId));
        if (!patientDoc.exists()) return;
        
        const patient = patientDoc.data();
        const tasks = patient.tasks || [];
        
        const taskIndex = tasks.findIndex(t => t.id === taskId);
        if (taskIndex !== -1) {
            tasks[taskIndex].completed = true;
            tasks[taskIndex].completedAt = new Date().toISOString();
            
            await updateDoc(doc(db, 'users', currentUserId, 'patients', patientId), {
                tasks: tasks
            });
        }
        
    } catch (error) {
        console.error('Error completing task:', error);
    }
}

// Delete task
async function deleteTask(patientId, taskId) {
    if (!confirm('Supprimer cette tâche ?')) return;
    
    try {
        const { doc, getDoc, updateDoc } = window.firestoreFunctions;
        
        const patientDoc = await getDoc(doc(db, 'users', currentUserId, 'patients', patientId));
        if (!patientDoc.exists()) return;
        
        const patient = patientDoc.data();
        const tasks = patient.tasks || [];
        
        const filteredTasks = tasks.filter(t => t.id !== taskId);
        
        await updateDoc(doc(db, 'users', currentUserId, 'patients', patientId), {
            tasks: filteredTasks
        });
        
    } catch (error) {
        console.error('Error deleting task:', error);
    }
}

// Show decision menu
function showDecisionMenu(patientId, event) {
    event.stopPropagation();
    
    // Remove existing menu
    const existingMenu = $('.floating-menu');
    if (existingMenu) existingMenu.remove();
    
    const menu = document.createElement('div');
    menu.className = 'floating-menu';
    menu.style.position = 'absolute';
    menu.style.top = event.pageY + 'px';
    menu.style.left = event.pageX + 'px';
    
    menu.innerHTML = `
        <button class="menu-item discharge" onclick="dischargePatient('${patientId}')">🏠 Retour domicile</button>
        <button class="menu-item hospitalize" onclick="hospitalizePatient('${patientId}')">🏥 Hospitaliser</button>
        <button class="menu-item transfer" onclick="showTransferPatientModal('${patientId}')">🚑 Transférer</button>
        <button class="menu-item delete" onclick="deletePatient('${patientId}')">🗑️ Supprimer</button>
    `;
    
    document.body.appendChild(menu);
    
    // Close menu when clicking outside
    setTimeout(() => {
        document.addEventListener('click', function closeMenu() {
            menu.remove();
            document.removeEventListener('click', closeMenu);
        });
    }, 100);
}

// Discharge patient
async function dischargePatient(patientId) {
    if (!confirm('Marquer ce patient comme sorti (retour domicile) ?')) return;
    
    try {
        await handlePatientDecision(patientId, 'discharged');
    } catch (error) {
        console.error('Error discharging patient:', error);
    }
}

// Hospitalize patient
async function hospitalizePatient(patientId) {
    if (!confirm('Marquer ce patient comme hospitalisé ?')) return;
    
    try {
        await handlePatientDecision(patientId, 'hospitalized');
    } catch (error) {
        console.error('Error hospitalizing patient:', error);
    }
}

// Handle patient decision
async function handlePatientDecision(patientId, decision) {
    try {
        const { doc, getDoc, deleteDoc, updateDoc, increment } = window.firestoreFunctions;
        
        // Get patient data first
        const patientDoc = await getDoc(doc(db, 'users', currentUserId, 'patients', patientId));
        if (!patientDoc.exists()) return;
        
        const patient = patientDoc.data();
        const timeSpent = calculateTimeSpentMinutes(patient.createdAt);
        
        // Delete patient from active patients
        await deleteDoc(doc(db, 'users', currentUserId, 'patients', patientId));
        
        // Update stats
        const statsUpdate = {
            [decision]: increment(1),
            totalTimeMinutes: increment(timeSpent),
            totalPatients: increment(1),
            lastUpdated: new Date().toISOString()
        };
        
        await updateDoc(doc(db, 'userStats', currentUserId), statsUpdate);
        
    } catch (error) {
        console.error('Error handling patient decision:', error);
        alert('Erreur lors du traitement de la décision');
    }
}

// Calculate time spent in minutes
function calculateTimeSpentMinutes(createdAt) {
    const now = new Date();
    const created = new Date(createdAt);
    return Math.floor((now - created) / (1000 * 60));
}

// Delete patient
async function deletePatient(patientId) {
    if (!confirm('Supprimer définitivement ce patient ?')) return;
    
    try {
        const { doc, deleteDoc } = window.firestoreFunctions;
        await deleteDoc(doc(db, 'users', currentUserId, 'patients', patientId));
    } catch (error) {
        console.error('Error deleting patient:', error);
    }
}

// Show transfer modal
function showTransferModal() {
    // Implementation for transfer functionality
    alert('Fonctionnalité de transfert à implémenter');
}

// Check for transfers
async function checkForTransfers() {
    // Implementation for checking incoming transfers
    console.log('Checking for transfers...');
}

// Handle incoming transfer
function handleIncomingTransfer(transferDoc) {
    // Implementation for handling incoming transfers
    console.log('Handling incoming transfer:', transferDoc.data());
}

// Reset stats
async function resetStats() {
    if (!confirm('Réinitialiser toutes les statistiques ? Cette action est irréversible.')) return;
    
    try {
        const { doc, setDoc } = window.firestoreFunctions;
        
        await setDoc(doc(db, 'userStats', currentUserId), {
            added: 0,
            hospitalized: 0,
            discharged: 0,
            transferred: 0,
            totalTimeMinutes: 0,
            totalPatients: 0,
            lastUpdated: new Date().toISOString()
        });
        
        alert('Statistiques réinitialisées');
        
    } catch (error) {
        console.error('Error resetting stats:', error);
        alert('Erreur lors de la réinitialisation');
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeApp);
