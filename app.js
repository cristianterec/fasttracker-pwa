/*  app.js – FastTrackers PWA with Firestore sync (vanilla JS, Firebase v9)  */
import { initializeApp }  from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js';
import {
  getFirestore, collection, doc, setDoc, getDoc,
  deleteDoc, onSnapshot, updateDoc
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';

/* --- Firebase config ---------------------------------------------------- */
const firebaseConfig = {
  apiKey: "AIzaSyB8PDbtjAqmEw8-jTuiHGgx2W1a9O1gRQU",
  authDomain: "fasttrackers-sync.firebaseapp.com",
  projectId: "fasttrackers-sync",
  storageBucket: "fasttrackers-sync.firebasestorage.app",
  messagingSenderId: "987908003870",
  appId: "1:987908003870:web:0e9c19e942df988c5ab60f"
};

initializeApp(firebaseConfig);
const db   = getFirestore();
const col  = (user) => collection(db, user);          // patients per profile
const stat = (user) => doc(db, user + '_stats', 'main');

/* --- DOM helpers -------------------------------------------------------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const byId = (id) => document.getElementById(id);

/* --- State -------------------------------------------------------------- */
let user = null;          // current profile
let unsub = null;         // Firestore listener unsubscribe

/* --- Login logic -------------------------------------------------------- */
$('#login').addEventListener('click', (e) => {
  if (!e.target.dataset.user) return;
  user = e.target.dataset.user;
  $('#username').textContent = user;
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  startRealtime();
});

$('#logout').onclick = () => {
  if (unsub) unsub();
  user = null;
  $('#app').classList.add('hidden');
  $('#login').classList.remove('hidden');
};

/* --- Realtime listener -------------------------------------------------- */
function startRealtime() {
  /* Patients */
  unsub = onSnapshot(col(user), (snap) => {
    const grid = byId('grid');
    if (snap.empty) { grid.innerHTML = '<p style="opacity:.6">Aucun patient</p>'; return; }

    grid.innerHTML = '';
    snap.forEach(docSnap => grid.appendChild(renderCard(docSnap.data())));
  });

  /* Stats */
  onSnapshot(stat(user), (d) => {
    const s = d.data() || {ad:0,ho:0,ho2:0,de:0};
    byId('sAdded').textContent = s.ad || 0;
    byId('sHosp').textContent  = s.ho || 0;
    byId('sHome').textContent  = s.ho2|| 0;
    byId('sDel').textContent   = s.de || 0;
  });
}

/* --- Add patient -------------------------------------------------------- */
$('#addPatient').onclick = () => newPatientModal();

function newPatientModal() {
  const tmp = document.createElement('div');
  tmp.className = 'modal-overlay';
  tmp.innerHTML = `
    <div class="modal">
      <h2>➕ Nouveau patient</h2>
      <input id="pn"  placeholder="Nom *">
      <input id="pc"  placeholder="Motif *">
      <select id="pt">
        <option value="">Triage *</option>
        <option value="red">Rouge</option><option value="orange">Orange</option>
        <option value="yellow">Jaune</option><option value="green">Vert</option>
        <option value="blue">Bleu</option><option value="purple">Violet</option>
      </select>
      <input id="pl" placeholder="📍 Localisation">
      <input id="pi" placeholder="📱 Infirmière">
      <button id="saveP">Enregistrer</button>
    </div>`;
  document.body.append(tmp);
  $('#saveP').onclick = async () => {
    const name=$('#pn').value.trim(), comp=$('#pc').value.trim(), tri=$('#pt').value;
    if(!name||!comp||!tri) return alert('Champs requis');
    const id = 'p_'+Date.now();
    await setDoc(doc(col(user), id), {
      id,name,comp,tri,
      loc:$('#pl').value.trim(), nurse:$('#pi').value.trim(), tasks:[]
    });
    await incStat('ad');
    tmp.remove();
  };
  tmp.onclick = (e)=>{if(e.target===tmp)tmp.remove();}
}

/* --- Render card -------------------------------------------------------- */
function renderCard(p) {
  const card = document.createElement('div');
  card.className = `card ${p.tri}`;
  card.innerHTML = `
    <div class="info-box" data-id="${p.id}">
      📍 ${p.loc||'--'}<br/>📱 ${p.nurse||'--'}
    </div>
    <h3>${p.name}</h3>
    <p>${p.comp}</p>
    <div class="tasks">${renderTasks(p)}</div>
    <div class="actions">
      <button class="btn task"   data-id="${p.id}">📋 Tâches</button>
      <button class="btn dec"    data-id="${p.id}">⚖️ Décision</button>
    </div>`;
  return card;
}

/* Render tasks list */
function renderTasks(p){
  return p.tasks.filter(t=>!t.done).map(t=>{
    const left = t.due ? Math.max(0, t.due - Date.now()) : null;
    const txt  = left?ms(left):'--:--';
    return `<div class="task"><span>${t.desc}</span><span>${txt}</span></div>`;
  }).join('');
}
function ms(ms){const m=Math.floor(ms/6e4).toString().padStart(2,'0');
                const s=Math.floor(ms/1e3)%60;return m+':'+s.toString().padStart(2,'0');}

/* --- Statistics helpers ------------------------------------------------- */
async function incStat(key){
  await updateDoc(stat(user), {[key]:firebase.firestore.FieldValue.increment(1)})
  .catch(async()=>{await setDoc(stat(user),{ad:0,ho:0,ho2:0,de:0}); incStat(key);});
}
byId('resetStats').onclick = ()=>{if(confirm('RAZ stats ?')) setDoc(stat(user), {ad:0,ho:0,ho2:0,de:0});};

/* --- Simple tab switch -------------------------------------------------- */
$$('.tab').forEach(t=>t.onclick=()=>{
  $$('.tab').forEach(x=>x.classList.remove('active'));
  t.classList.add('active');
  $$('.tab-content').forEach(c=>c.classList.add('hidden'));
  byId(t.dataset.tab).classList.remove('hidden');
});
