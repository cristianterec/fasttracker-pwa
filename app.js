/* FastTrackers PWA – build 2025-07-26
   Full source – replace your existing app.js with this file
   ───────────────────────────────────────────────────────── */

console.log('FastTrackers PWA – loading…');

///////////////////////////////////////////////////////////////////////////////
// 0 Globals & helpers
///////////////////////////////////////////////////////////////////////////////
import {
  initializeApp
}                         from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js';
import {
  getFirestore, doc, collection, addDoc, setDoc, updateDoc, deleteDoc,
  increment, serverTimestamp, onSnapshot, runTransaction, enableIndexedDbPersistence
}                         from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey:            'AIzaSyB8PDbtjAqmEw8-jTuiHGgx2W1a9O1gRQU',
  authDomain:        'fasttrackers-sync.firebaseapp.com',
  projectId:         'fasttrackers-sync',
  storageBucket:     'fasttrackers-sync.appspot.com',
  messagingSenderId: '987908003870',
  appId:             '1:987908003870:web:0e9c19e942df988c5ab60f'
};

let app, db, currentUserId = 'defaultUser';   // *** replace with auth later ***

// Shorthand
const $  = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

// Reusable timestamp formatter
const fmt = ms => {
  const t = Math.floor(ms / 1000), m = Math.floor(t / 60), s = (t % 60).toString().padStart(2,'0');
  return `${m}m ${s}s`;
};

///////////////////////////////////////////////////////////////////////////////
// 1 Firebase init + offline mode
///////////////////////////////////////////////////////////////////////////////
(async () => {
  app = initializeApp(firebaseConfig);
  db  = getFirestore(app);
  try {
    await enableIndexedDbPersistence(db);
    console.info('Firestore offline persistence enabled');
  } catch(e) {
    console.warn('Could not enable persistence', e.code);
  }
  // Main UI bootstrap once DB ready
  listenPatients();
  listenStats();
})();

///////////////////////////////////////////////////////////////////////////////
// 2 Patient CRUD
///////////////////////////////////////////////////////////////////////////////

// 2 a Add patient (modal “Enregistrer”)
$('#savePatient').addEventListener('click', async e => {
  e.preventDefault();

  const name        = $('#newName').value.trim()      || '—';
  const triageColor = $('.triage-picker .selected')?.dataset.color || 'purple';
  const bed         = $('#newBed').value.trim()       || '—';
  const nurse       = $('#newNurse').value.trim()     || '—';
  const note        = $('#newNote').value.trim();        // possibly empty

  try {
    await addDoc(collection(db, 'users', currentUserId, 'patients'), {
      name, triageColor, bed, nurse, note,
      createdAt: serverTimestamp(),
      status: 'active',
      tasks: []                       // always present => avoids undefined errors
    });
    // close modal
    $('#addPatientModal').classList.add('hidden');
  } catch (err) {
    alert('Erreur lors de l\'ajout du patient');           // UX text unchanged
    console.error('addPatient failed:', err);             // details in console
  }
});

// 2 b Status-changing action buttons inside each card
document.body.addEventListener('click', async e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;

  const card   = btn.closest('.card');
  const id     = card.dataset.id;
  const action = btn.dataset.action;           // discharge | hospitalise | transfer | delete
  const ref    = doc(db, 'users', currentUserId, 'patients', id);

  try {
    await runTransaction(db, async t => {
      const snap = await t.get(ref);
      if (!snap.exists()) return;

      const patient = snap.data();
      const now   = Date.now();
      const start = patient.createdAt?.toMillis() || now;
      const stay  = now - start;      // ms

      switch (action) {
        case 'delete':
          t.delete(ref);
          break;

        default:
          t.update(ref, { status: action, closedAt: serverTimestamp() });
      }

      // statistics update in same transaction (single round-trip, atomic)
      const sRef = doc(db, 'users', currentUserId, 'stats', 'global');
      const delta = {};
      delta[`count.${action}`] = increment(1);
      delta['time.totalMs']    = increment(stay);
      delta['time.cases']      = increment(1);
      t.set(sRef, delta, { merge: true });
    });
  } catch (err) {
    console.error('Action failed', err);
  }
});

///////////////////////////////////////////////////////////////////////////////
// 3 Live listeners → UI render
///////////////////////////////////////////////////////////////////////////////
function listenPatients() {
  const q = collection(db, 'users', currentUserId, 'patients');
  onSnapshot(q, snap => {
    $('#patientList').innerHTML = '';   // drop & rebuild; few cards so this is fine
    snap.forEach(docSnap => renderCard(docSnap.id, docSnap.data()));
    toggleEmptyState(snap.size === 0);
  });
}

function listenStats() {
  const ref = doc(db, 'users', currentUserId, 'stats', 'global');
  onSnapshot(ref, s => updateStatsUI(s.data() || {}));
}

///////////////////////////////////////////////////////////////////////////////
// 4 Rendering helpers
///////////////////////////////////////////////////////////////////////////////
function renderCard(id, p) {
  const card      = document.createElement('article');
  card.className  = `card ${p.note ? 'has-notes' : 'no-notes'} triage-${p.triageColor}`;
  card.dataset.id = id;

  // Timer
  const started = p.createdAt?.toMillis() || Date.now();
  const timer   = document.createElement('span');
  timer.className = 'timer';
  timer.textContent = '0m 00s';
  card.append(timer);
  startLiveTimer(timer, started);

  // Name & bed
  card.insertAdjacentHTML('beforeend', `
    <h3>${p.name}</h3>
    <small>${p.bed}</small>
  `);

  // Optional note
  if (p.note) {
    card.insertAdjacentHTML('beforeend', `<p class="note">${p.note}</p>`);
  }

  // Task list
  const ul = document.createElement('ul');
  ul.className = 'tasks';
  p.tasks.forEach(t => {
    const li = document.createElement('li');
    li.textContent = t;
    ul.append(li);
  });
  card.append(ul);

  // Action buttons
  card.insertAdjacentHTML('beforeend', `
    <footer>
      <button data-action="discharge"  class="green">Sortie</button>
      <button data-action="hospitalise" class="blue">Hospit.</button>
      <button data-action="transfer"    class="orange">Transfert</button>
      <button data-action="delete"      class="red">✕</button>
    </footer>
  `);

  $('#patientList').append(card);
}

function toggleEmptyState(isEmpty) {
  $('#emptyBox').classList.toggle('hidden', !isEmpty);
}

// live ticking
function startLiveTimer(el, startMs) {
  const tick = () => el.textContent = fmt(Date.now() - startMs);
  tick();
  const h = setInterval(tick, 1000);
  // stop interval when card removed
  const obs = new MutationObserver(() => {
    if (!document.body.contains(el)) {
      clearInterval(h); obs.disconnect();
    }
  });
  obs.observe(document.body, { childList:true, subtree:true });
}

// stats panel
function msToMin(ms) { return (ms/60000).toFixed(1); }
function updateStatsUI(d) {
  const c = d.count || {};
  $('#statAdded'       ).textContent = c.added       || 0;
  $('#statDischarged'  ).textContent = c.discharge   || 0;
  $('#statHospitalised').textContent = c.hospitalise || 0;
  $('#statTransferred' ).textContent = c.transfer    || 0;
  $('#statDeleted'     ).textContent = c.delete      || 0;

  const total = d.time?.totalMs   || 0;
  const n     = d.time?.cases     || 0;
  $('#statAvgStay').textContent = n ? `${msToMin(total/n)} min` : '—';
}

///////////////////////////////////////////////////////////////////////////////
// 5 Misc UI wiring
///////////////////////////////////////////////////////////////////////////////

// Triage colour picker
$$('.triage-picker button').forEach(btn => {
  btn.addEventListener('click', e => {
    $$('.triage-picker .selected').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  });
});

// “Ajouter un patient” floating button
$('#btnAddPatient').addEventListener('click', () => {
  $('#addPatientModal').classList.remove('hidden');
});

$('#modalClose').addEventListener('click', () => {
  $('#addPatientModal').classList.add('hidden');
});
