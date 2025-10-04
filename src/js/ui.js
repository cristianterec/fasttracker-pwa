// ui.js - presentation helpers for the FastTrackers privacy-first demo

const formatter = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'short',
  timeStyle: 'short'
});

export function formatTimestamp(timestamp) {
  if (!timestamp) {
    return '—';
  }
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return formatter.format(date);
}

export function renderPatientsTable(patients, nameMap, filterText = '') {
  const tbody = document.querySelector('#patientsTableBody');
  const noData = document.querySelector('#noPatientsRow');
  if (!tbody) return;

  const normalisedFilter = filterText.trim().toLowerCase();
  const filtered = patients.filter((patient) => {
    if (!normalisedFilter) return true;
    const localName = nameMap.get(patient.patientCode) || '';
    const values = [localName, patient.chiefComplaint || ''];
    return values.some((value) => value.toLowerCase().includes(normalisedFilter));
  });

  tbody.innerHTML = '';

  if (filtered.length === 0) {
    if (noData) {
      noData.classList.remove('hidden');
    }
    return;
  }

  if (noData) {
    noData.classList.add('hidden');
  }

  const fragment = document.createDocumentFragment();

  filtered.forEach((patient) => {
    const tr = document.createElement('tr');
    tr.dataset.patientId = patient.id;
    tr.dataset.patientCode = patient.patientCode;

    const name = nameMap.get(patient.patientCode);
    const displayName = name && name.trim() ? name : '—';

    tr.innerHTML = `
      <td class="cell-code"><span class="code-pill">${patient.patientCode}</span></td>
      <td class="cell-name">${displayName}</td>
      <td>${patient.chiefComplaint || '—'}</td>
      <td>${formatTimestamp(patient.createdAt)}</td>
      <td class="cell-actions">
        <button class="secondary" data-action="copy">Copier</button>
        <button class="secondary" data-action="edit-name">${displayName === '—' ? 'Ajouter le nom' : 'Modifier le nom'}</button>
      </td>
    `;
    fragment.appendChild(tr);
  });

  tbody.appendChild(fragment);
}

export function ensureToastContainer() {
  let container = document.querySelector('#toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    document.body.appendChild(container);
  }
  return container;
}

export function showToast(message, buttonLabel, onButtonClick) {
  const container = ensureToastContainer();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <span>${message}</span>
    <button class="secondary toast-button">${buttonLabel}</button>
  `;
  const button = toast.querySelector('button');
  button.addEventListener('click', async () => {
    try {
      await onButtonClick();
    } catch (error) {
      console.warn('Impossible de copier le code :', error);
    }
    container.removeChild(toast);
  });
  container.appendChild(toast);
  setTimeout(() => {
    if (toast.parentElement === container) {
      container.removeChild(toast);
    }
  }, 5000);
}
