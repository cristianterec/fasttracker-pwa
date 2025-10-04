// patients.js - wraps Firestore calls for the patients collection
// Ensures we never send last names to the server

import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let db = null;

export function initPatientsModule(app) {
  db = getFirestore(app);
  return db;
}

function scrubPatientData(data) {
  const safeData = { ...data };
  if ('lastName' in safeData) {
    delete safeData.lastName;
  }
  return safeData;
}

export async function createPatient({ doctorId, patientCode, chiefComplaint }) {
  if (!db) {
    throw new Error('Firestore not initialised');
  }
  const patientsRef = collection(db, 'patients');
  const safeData = scrubPatientData({
    doctorId,
    patientCode,
    chiefComplaint,
    createdAt: serverTimestamp()
  });
  await addDoc(patientsRef, safeData);
  return safeData;
}

export function subscribeToPatients(doctorId, callback) {
  if (!db) {
    throw new Error('Firestore not initialised');
  }
  const patientsRef = collection(db, 'patients');
  const q = query(patientsRef, where('doctorId', '==', doctorId), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const patients = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data()
    }));
    callback(patients);
  });
}
