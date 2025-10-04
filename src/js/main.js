import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

import { generatePatientCode } from './ids.js';
import { saveLocalName, getManyLocalNames } from './localNames.js';
import { initPatientsModule, createPatient, subscribeToPatients } from './patients.js';
import { renderPatientsTable, showToast } from './ui.js';

// Replace with your own Firebase project configuration
const firebaseConfig = {
  apiKey: 'AIzaSyB8PDbtjAqmEw8-jTuiHGgx2W1a9O1gRQU',
  authDomain: 'fasttrackers-sync.firebaseapp.com',
  projectId: 'fasttrackers-sync',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
initPatientsModule(app);

const authSection = document.querySelector('#authSection');
const appSection = document.querySelector('#appSection');
const loginForm = document.querySelector('#loginForm');
const registerForm = document.querySelector('#registerForm');
const toggleToRegister = document.querySelector('#toggleToRegister');
const toggleToLogin = document.querySelector('#toggleToLogin');
const addPatientForm = document.querySelector('#addPatientForm');
const searchInput = document.querySelector('#searchInput');
const logoutButton = document.querySelector('#logoutButton');
const doctorLabel = document.querySelector('#doctorLabel');

let unsubscribePatients = null;
let cachedPatients = [];
let nameMap = new Map();
let currentFilter = '';

function showAuth() {
  authSection.classList.remove('hidden');
  appSection.classList.add('hidden');
  doctorLabel.textContent = '';
  logoutButton.classList.add('hidden');
  loginForm.classList.remove('hidden');
  registerForm.classList.add('hidden');
}

function showApp(user) {
  authSection.classList.add('hidden');
  appSection.classList.remove('hidden');
  doctorLabel.textContent = user.email;
  logoutButton.classList.remove('hidden');
}

async function handleLogin(event) {
  event.preventDefault();
  const email = loginForm.email.value.trim();
  const pin = loginForm.pin.value.trim();
  if (!email || !pin) return;
  try {
    await signInWithEmailAndPassword(auth, email, pin);
    loginForm.reset();
  } catch (error) {
    alert('Connexion impossible : ' + error.message);
  }
}

async function handleRegister(event) {
  event.preventDefault();
  const email = registerForm.email.value.trim();
  const pin = registerForm.pin.value.trim();
  const confirm = registerForm.confirm.value.trim();
  if (!email || !pin || !confirm) {
    alert('Veuillez remplir tous les champs');
    return;
  }
  if (pin !== confirm) {
    alert('Les codes PIN ne correspondent pas');
    return;
  }
  if (!/^\d{4}$/.test(pin)) {
    alert('Le PIN doit contenir exactement 4 chiffres');
    return;
  }
  try {
    await createUserWithEmailAndPassword(auth, email, pin);
    registerForm.reset();
  } catch (error) {
    alert('Inscription impossible : ' + error.message);
  }
}

async function handleAddPatient(event) {
  event.preventDefault();
  const lastName = addPatientForm.lastName.value.trim();
  const complaint = addPatientForm.complaint.value.trim();
  if (!complaint) {
    alert('Veuillez saisir un motif de consultation');
    return;
  }

  const patientCode = generatePatientCode();
  const doctorId = auth.currentUser.uid;

  if (lastName) {
    await saveLocalName(patientCode, lastName);
  }

  await createPatient({ doctorId, patientCode, chiefComplaint: complaint });

  showToast(`Patient ${patientCode} créé`, 'Copier le code', () => navigator.clipboard.writeText(patientCode));

  addPatientForm.reset();
  addPatientForm.lastName.focus();
}

function updateTable() {
  renderPatientsTable(cachedPatients, nameMap, currentFilter);
}

async function refreshNames() {
  const codes = cachedPatients.map((patient) => patient.patientCode);
  nameMap = await getManyLocalNames(codes);
  updateTable();
}

function startPatientsListener(user) {
  if (unsubscribePatients) {
    unsubscribePatients();
  }
  unsubscribePatients = subscribeToPatients(user.uid, async (patients) => {
    cachedPatients = patients;
    await refreshNames();
  });
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    showApp(user);
    startPatientsListener(user);
  } else {
    if (unsubscribePatients) {
      unsubscribePatients();
      unsubscribePatients = null;
    }
    cachedPatients = [];
    nameMap = new Map();
    currentFilter = '';
    searchInput.value = '';
    updateTable();
    showAuth();
  }
});

loginForm.addEventListener('submit', handleLogin);
registerForm.addEventListener('submit', handleRegister);
addPatientForm.addEventListener('submit', handleAddPatient);

toggleToRegister.addEventListener('click', () => {
  loginForm.classList.add('hidden');
  registerForm.classList.remove('hidden');
});

toggleToLogin.addEventListener('click', () => {
  registerForm.classList.add('hidden');
  loginForm.classList.remove('hidden');
});

logoutButton.addEventListener('click', () => signOut(auth));

searchInput.addEventListener('input', (event) => {
  currentFilter = event.target.value;
  updateTable();
});

const table = document.querySelector('#patientsTable');
table.addEventListener('click', async (event) => {
  const action = event.target.dataset.action;
  if (!action) return;
  const row = event.target.closest('tr');
  if (!row) return;
  const code = row.dataset.patientCode;
  if (action === 'copy') {
    try {
      await navigator.clipboard.writeText(code);
      event.target.textContent = 'Copié !';
    } catch (error) {
      console.warn('Impossible de copier le code :', error);
      event.target.textContent = 'Erreur';
    }
    event.target.disabled = true;
    setTimeout(() => {
      event.target.textContent = 'Copier';
      event.target.disabled = false;
    }, 1500);
  }
  if (action === 'edit-name') {
    const current = nameMap.get(code) || '';
    const newName = prompt('Nom de famille', current);
    if (newName !== null) {
      await saveLocalName(code, newName);
      nameMap.set(code, newName.trim());
      updateTable();
    }
  }
});
