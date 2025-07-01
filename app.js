// FastTrackers PWA - Emergency Medicine Patient Management
class FastTrackersApp {
    constructor() {
        this.currentUser = null;
        this.patients = {};
        this.statistics = {};
        this.timers = new Map();
        this.currentPatientId = null;
        
        this.triageColors = {
            red: '#dc2626',
            orange: '#ea580c',
            yellow: '#eab308',
            green: '#16a34a',
            blue: '#2563eb',
            purple: '#7c3aed'
        };
        
        this.init();
    }
    
    init() {
        this.loadData();
        this.bindEvents();
        this.registerServiceWorker();
        this.showLoginScreen();
    }
    
    // Service Worker Registration
    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            const swCode = `
                const CACHE_NAME = 'fasttrackers-v1';
                const urlsToCache = [
                    '/',
                    '/index.html',
                    '/style.css',
                    '/app.js'
                ];
                
                self.addEventListener('install', (event) => {
                    event.waitUntil(
                        caches.open(CACHE_NAME)
                            .then((cache) => cache.addAll(urlsToCache))
                    );
                });
                
                self.addEventListener('fetch', (event) => {
                    event.respondWith(
                        caches.match(event.request)
                            .then((response) => {
                                if (response) {
                                    return response;
                                }
                                return fetch(event.request);
                            })
                    );
                });
            `;
            
            const blob = new Blob([swCode], { type: 'application/javascript' });
            const swUrl = URL.createObjectURL(blob);
            
            navigator.serviceWorker.register(swUrl)
                .then(() => console.log('Service Worker registered'))
                .catch(err => console.log('Service Worker registration failed:', err));
        }
    }
    
    // Data Management
    loadData() {
        try {
            const savedData = localStorage.getItem('fasttrackers-data');
            if (savedData) {
                const data = JSON.parse(savedData);
                this.patients = data.patients || {};
                this.statistics = data.statistics || this.initializeStatistics();
            } else {
                this.patients = {};
                this.statistics = this.initializeStatistics();
            }
        } catch (error) {
            console.error('Error loading data:', error);
            this.patients = {};
            this.statistics = this.initializeStatistics();
        }
    }
    
    saveData() {
        try {
            const data = {
                patients: this.patients,
                statistics: this.statistics
            };
            localStorage.setItem('fasttrackers-data', JSON.stringify(data));
        } catch (error) {
            console.error('Error saving data:', error);
        }
    }
    
    initializeStatistics() {
        return {
            totalPatients: 0,
            activePatients: 0,
            dischargedPatients: 0,
            admittedPatients: 0,
            redPatients: 0,
            orangePatients: 0,
            yellowPatients: 0,
            greenPatients: 0,
            bluePatients: 0,
            purplePatients: 0
        };
    }
    
    // Event Binding
    bindEvents() {
        // Login events
        document.querySelectorAll('.login-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const user = e.currentTarget.dataset.user;
                this.login(user);
            });
        });
        
        // Logout event
        document.getElementById('logout-btn').addEventListener('click', () => {
            this.logout();
        });
        
        // Navigation events
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabName = e.currentTarget.dataset.tab;
                this.switchTab(tabName);
            });
        });
        
        // Patient management events
        document.getElementById('add-patient-btn').addEventListener('click', () => {
            this.showPatientModal();
        });
        
        document.getElementById('patient-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.savePatient();
        });
        
        // Modal events
        document.getElementById('modal-close').addEventListener('click', () => {
            this.hidePatientModal();
        });
        
        document.getElementById('cancel-btn').addEventListener('click', () => {
            this.hidePatientModal();
        });
        
        // Task management events
        document.getElementById('task-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveTask();
        });
        
        document.getElementById('task-modal-close').addEventListener('click', () => {
            this.hideTaskModal();
        });
        
        document.getElementById('task-cancel-btn').addEventListener('click', () => {
            this.hideTaskModal();
        });
        
        // Edit meta events
        document.getElementById('edit-meta-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.savePatientMeta();
        });
        
        document.getElementById('edit-meta-modal-close').addEventListener('click', () => {
            this.hideEditMetaModal();
        });
        
        document.getElementById('edit-meta-cancel-btn').addEventListener('click', () => {
            this.hideEditMetaModal();
        });
        
        // Statistics events
        document.getElementById('reset-stats-btn').addEventListener('click', () => {
            this.resetStatistics();
        });
        
        // Close modals on outside click
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.hidePatientModal();
                this.hideTaskModal();
                this.hideEditMetaModal();
            }
        });
    }
    
    // Authentication
    login(user) {
        this.currentUser = user;
        this.loadUserData();
        this.showMainScreen();
        this.updateUI();
    }
    
    logout() {
        this.saveUserData();
        this.currentUser = null;
        this.patients = {};
        this.stopAllTimers();
        this.showLoginScreen();
    }
    
    loadUserData() {
        const userKey = `fasttrackers-${this.currentUser}`;
        try {
            const userData = localStorage.getItem(userKey);
            if (userData) {
                const data = JSON.parse(userData);
                this.patients = data.patients || {};
                this.statistics = data.statistics || this.initializeStatistics();
            } else {
                this.patients = {};
                this.statistics = this.initializeStatistics();
            }
        } catch (error) {
            console.error('Error loading user data:', error);
            this.patients = {};
            this.statistics = this.initializeStatistics();
        }
    }
    
    saveUserData() {
        if (!this.currentUser) return;
        
        const userKey = `fasttrackers-${this.currentUser}`;
        try {
            const data = {
                patients: this.patients,
                statistics: this.statistics
            };
            localStorage.setItem(userKey, JSON.stringify(data));
        } catch (error) {
            console.error('Error saving user data:', error);
        }
    }
    
    // Screen Management
    showLoginScreen() {
        document.getElementById('login-screen').classList.add('active');
        document.getElementById('main-screen').classList.remove('active');
    }
    
    showMainScreen() {
        document.getElementById('login-screen').classList.remove('active');
        document.getElementById('main-screen').classList.add('active');
    }
    
    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        
        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`).classList.add('active');
        
        if (tabName === 'statistics') {
            this.updateStatistics();
        }
    }
    
    updateUI() {
        document.getElementById('current-user').textContent = `FastTrackers - ${this.currentUser}`;
        this.renderPatients();
        this.updateStatistics();
    }
    
    // Patient Management
    showPatientModal(patientId = null) {
        this.currentPatientId = patientId;
        const modal = document.getElementById('patient-modal');
        const title = document.getElementById('modal-title');
        const form = document.getElementById('patient-form');
        
        if (patientId) {
            title.textContent = 'Modifier Patient';
            const patient = this.patients[patientId];
            document.getElementById('patient-name').value = patient.name;
            document.getElementById('patient-complaint').value = patient.complaint;
            document.getElementById('patient-triage').value = patient.triage;
            document.getElementById('patient-room').value = patient.room || '';
            document.getElementById('patient-nurse').value = patient.nurse || '';
        } else {
            title.textContent = 'Ajouter Patient';
            form.reset();
        }
        
        modal.classList.add('active');
    }
    
    hidePatientModal() {
        document.getElementById('patient-modal').classList.remove('active');
        this.currentPatientId = null;
    }
    
    savePatient() {
        const name = document.getElementById('patient-name').value.trim();
        const complaint = document.getElementById('patient-complaint').value.trim();
        const triage = document.getElementById('patient-triage').value;
        const room = document.getElementById('patient-room').value.trim();
        const nurse = document.getElementById('patient-nurse').value.trim();
        
        if (!name || !complaint || !triage) {
            alert('Veuillez remplir tous les champs obligatoires.');
            return;
        }
        
        const patientId = this.currentPatientId || this.generateId();
        const isNew = !this.currentPatientId;
        
        this.patients[patientId] = {
            id: patientId,
            name,
            complaint,
            triage,
            room,
            nurse,
            tasks: this.patients[patientId]?.tasks || [],
            createdAt: this.patients[patientId]?.createdAt || new Date().toISOString(),
            status: this.patients[patientId]?.status || 'active'
        };
        
        if (isNew) {
            this.statistics.totalPatients++;
            this.statistics.activePatients++;
            this.statistics[`${triage}Patients`]++;
        }
        
        this.saveUserData();
        this.hidePatientModal();
        this.renderPatients();
        this.updateStatistics();
    }
    
    // Edit Patient Meta (Location/Nurse)
    showEditMetaModal(patientId) {
        this.currentPatientId = patientId;
        const patient = this.patients[patientId];
        const modal = document.getElementById('edit-meta-modal');
        
        document.getElementById('edit-room').value = patient.room || '';
        document.getElementById('edit-nurse').value = patient.nurse || '';
        
        modal.classList.add('active');
    }
    
    hideEditMetaModal() {
        document.getElementById('edit-meta-modal').classList.remove('active');
        this.currentPatientId = null;
    }
    
    savePatientMeta() {
        const room = document.getElementById('edit-room').value.trim();
        const nurse = document.getElementById('edit-nurse').value.trim();
        
        if (this.currentPatientId && this.patients[this.currentPatientId]) {
            this.patients[this.currentPatientId].room = room;
            this.patients[this.currentPatientId].nurse = nurse;
            
            this.saveUserData();
            this.hideEditMetaModal();
            this.renderPatients();
        }
    }
    
    renderPatients() {
        const grid = document.getElementById('patients-grid');
        const activePatients = Object.values(this.patients).filter(p => p.status === 'active');
        
        if (activePatients.length === 0) {
            grid.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: var(--color-text-secondary);">
                    <h3 style="margin-bottom: 16px; font-size: 1.5rem;">Aucun patient actif</h3>
                    <p>Cliquez sur "Ajouter Patient" pour commencer.</p>
                </div>
            `;
            return;
        }
        
        grid.innerHTML = activePatients.map(patient => this.renderPatientCard(patient)).join('');
        
        // Bind events for patient cards
        this.bindPatientEvents();
    }
    
    renderPatientCard(patient) {
        const tasksHtml = patient.tasks && patient.tasks.length > 0 ? `
            <div class="patient-tasks">
                <h4>Tâches (${patient.tasks.length})</h4>
                ${patient.tasks.map(task => `
                    <div class="task-item">
                        <div class="task-content">
                            <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''} 
                                   data-task-id="${task.id}" data-patient-id="${patient.id}">
                            <span class="task-description ${task.completed ? 'completed' : ''}">${task.description}</span>
                        </div>
                        ${task.timer ? `<span class="task-timer" data-timer-id="${task.id}">${this.formatTime(task.timer.remaining)}</span>` : ''}
                    </div>
                `).join('')}
            </div>
        ` : '<div class="patient-tasks"><h4>Aucune tâche</h4></div>';
        
        return `
            <div class="patient-card triage-${patient.triage}" data-patient-id="${patient.id}">
                <div class="patient-header">
                    <div class="patient-name">${patient.name}</div>
                    <div class="patient-complaint">${patient.complaint}</div>
                    <div class="patient-meta-box" data-action="edit-meta" data-patient-id="${patient.id}">
                        ${patient.room ? `<span>📍 ${patient.room}</span>` : '<span>📍 Salle...</span>'}
                        ${patient.nurse ? `<span>📱 ${patient.nurse}</span>` : '<span>📱 Infirmier...</span>'}
                    </div>
                </div>
                <div class="patient-body">
                    ${tasksHtml}
                    <div class="patient-actions">
                        <button class="action-btn action-btn--task" data-action="add-task" data-patient-id="${patient.id}">
                            📋 Tâches
                        </button>
                        <div class="dropdown">
                            <button class="action-btn action-btn--disposition" data-action="disposition" data-patient-id="${patient.id}">
                                ⚖️ Décision
                            </button>
                            <div class="dropdown-content">
                                <button class="dropdown-item" data-action="discharge" data-patient-id="${patient.id}">
                                    🏠 Retour à domicile
                                </button>
                                <button class="dropdown-item" data-action="admit" data-patient-id="${patient.id}">
                                    🏥 Hospitalisation
                                </button>
                                <button class="dropdown-item danger" data-action="delete" data-patient-id="${patient.id}">
                                    🗑️ Supprimer le patient
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    bindPatientEvents() {
        // Task completion checkboxes
        document.querySelectorAll('.task-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const taskId = e.currentTarget.dataset.taskId;
                const patientId = e.currentTarget.dataset.patientId;
                this.toggleTaskCompletion(patientId, taskId, e.currentTarget.checked);
            });
        });
        
        // Edit meta boxes
        document.querySelectorAll('[data-action="edit-meta"]').forEach(box => {
            box.addEventListener('click', (e) => {
                const patientId = e.currentTarget.dataset.patientId;
                this.showEditMetaModal(patientId);
            });
        });
        
        // Task buttons
        document.querySelectorAll('[data-action="add-task"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const patientId = e.currentTarget.dataset.patientId;
                this.showTaskModal(patientId);
            });
        });
        
        // Disposition dropdowns
        document.querySelectorAll('[data-action="disposition"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const dropdown = e.currentTarget.closest('.dropdown');
                
                // Close other dropdowns
                document.querySelectorAll('.dropdown').forEach(d => {
                    if (d !== dropdown) d.classList.remove('active');
                });
                
                dropdown.classList.toggle('active');
            });
        });
        
        // Disposition actions
        document.querySelectorAll('[data-action="discharge"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const patientId = e.currentTarget.dataset.patientId;
                this.dischargePatient(patientId);
            });
        });
        
        document.querySelectorAll('[data-action="admit"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const patientId = e.currentTarget.dataset.patientId;
                this.admitPatient(patientId);
            });
        });
        
        document.querySelectorAll('[data-action="delete"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const patientId = e.currentTarget.dataset.patientId;
                this.deletePatient(patientId);
            });
        });
        
        // Close dropdowns on outside click
        document.addEventListener('click', () => {
            document.querySelectorAll('.dropdown').forEach(d => {
                d.classList.remove('active');
            });
        });
        
        // Start timers for tasks
        this.startPatientTimers();
    }
    
    // Task Management
    showTaskModal(patientId) {
        this.currentPatientId = patientId;
        const modal = document.getElementById('task-modal');
        document.getElementById('task-form').reset();
        modal.classList.add('active');
    }
    
    hideTaskModal() {
        document.getElementById('task-modal').classList.remove('active');
        this.currentPatientId = null;
    }
    
    saveTask() {
        const description = document.getElementById('task-description').value.trim();
        const minutes = parseInt(document.getElementById('timer-minutes').value) || 0;
        
        if (!description) {
            alert('Veuillez saisir une description de tâche.');
            return;
        }
        
        const taskId = this.generateId();
        const task = {
            id: taskId,
            description,
            completed: false,
            createdAt: new Date().toISOString()
        };
        
        // Only add timer if minutes > 0 (optional timer)
        if (minutes > 0) {
            const totalSeconds = minutes * 60;
            task.timer = {
                total: totalSeconds,
                remaining: totalSeconds,
                startTime: Date.now()
            };
        }
        
        if (!this.patients[this.currentPatientId].tasks) {
            this.patients[this.currentPatientId].tasks = [];
        }
        
        this.patients[this.currentPatientId].tasks.push(task);
        
        this.saveUserData();
        this.hideTaskModal();
        this.renderPatients();
    }
    
    toggleTaskCompletion(patientId, taskId, completed) {
        const patient = this.patients[patientId];
        if (patient && patient.tasks) {
            const task = patient.tasks.find(t => t.id === taskId);
            if (task) {
                task.completed = completed;
                this.saveUserData();
                this.renderPatients();
            }
        }
    }
    
    // Timer Management
    startPatientTimers() {
        // Stop existing timers
        this.stopAllTimers();
        
        // Start new timers
        Object.values(this.patients).forEach(patient => {
            if (patient.tasks) {
                patient.tasks.forEach(task => {
                    if (task.timer && task.timer.remaining > 0 && !task.completed) {
                        this.startTimer(task);
                    }
                });
            }
        });
    }
    
    startTimer(task) {
        const timerId = setInterval(() => {
            const elapsed = Math.floor((Date.now() - task.timer.startTime) / 1000);
            task.timer.remaining = Math.max(0, task.timer.total - elapsed);
            
            const timerElement = document.querySelector(`[data-timer-id="${task.id}"]`);
            if (timerElement) {
                timerElement.textContent = this.formatTime(task.timer.remaining);
                
                // Update timer status
                timerElement.classList.remove('warning', 'critical');
                if (task.timer.remaining <= 0) {
                    timerElement.classList.add('critical');
                    clearInterval(timerId);
                    this.timers.delete(task.id);
                } else if (task.timer.remaining <= 30) {
                    timerElement.classList.add('critical');
                } else if (task.timer.remaining <= 60) {
                    timerElement.classList.add('warning');
                }
            }
            
            if (task.timer.remaining <= 0) {
                clearInterval(timerId);
                this.timers.delete(task.id);
                this.saveUserData();
            }
        }, 1000);
        
        this.timers.set(task.id, timerId);
    }
    
    stopAllTimers() {
        this.timers.forEach((timerId) => {
            clearInterval(timerId);
        });
        this.timers.clear();
    }
    
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    
    // Patient Disposition
    dischargePatient(patientId) {
        if (confirm('Confirmer le retour à domicile de ce patient ?')) {
            this.patients[patientId].status = 'discharged';
            this.patients[patientId].dischargedAt = new Date().toISOString();
            this.statistics.activePatients--;
            this.statistics.dischargedPatients++;
            this.saveUserData();
            this.renderPatients();
            this.updateStatistics();
        }
    }
    
    admitPatient(patientId) {
        if (confirm('Confirmer l\'hospitalisation de ce patient ?')) {
            this.patients[patientId].status = 'admitted';
            this.patients[patientId].admittedAt = new Date().toISOString();
            this.statistics.activePatients--;
            this.statistics.admittedPatients++;
            this.saveUserData();
            this.renderPatients();
            this.updateStatistics();
        }
    }
    
    deletePatient(patientId) {
        if (confirm('Êtes-vous sûr de vouloir supprimer définitivement ce patient ?')) {
            const patient = this.patients[patientId];
            delete this.patients[patientId];
            
            // Update statistics
            this.statistics.totalPatients--;
            if (patient.status === 'active') {
                this.statistics.activePatients--;
            }
            this.statistics[`${patient.triage}Patients`]--;
            
            this.saveUserData();
            this.renderPatients();
            this.updateStatistics();
        }
    }
    
    // Statistics
    updateStatistics() {
        // Recalculate from current data
        const stats = this.initializeStatistics();
        
        Object.values(this.patients).forEach(patient => {
            stats.totalPatients++;
            
            if (patient.status === 'active') {
                stats.activePatients++;
            } else if (patient.status === 'discharged') {
                stats.dischargedPatients++;
            } else if (patient.status === 'admitted') {
                stats.admittedPatients++;
            }
            
            stats[`${patient.triage}Patients`]++;
        });
        
        this.statistics = stats;
        
        // Update UI
        document.getElementById('total-patients').textContent = stats.totalPatients;
        document.getElementById('active-patients').textContent = stats.activePatients;
        document.getElementById('discharged-patients').textContent = stats.dischargedPatients;
        document.getElementById('admitted-patients').textContent = stats.admittedPatients;
        document.getElementById('red-patients').textContent = stats.redPatients;
        document.getElementById('orange-patients').textContent = stats.orangePatients;
        document.getElementById('yellow-patients').textContent = stats.yellowPatients;
        document.getElementById('green-patients').textContent = stats.greenPatients;
        document.getElementById('blue-patients').textContent = stats.bluePatients;
        document.getElementById('purple-patients').textContent = stats.purplePatients;
        
        this.saveUserData();
    }
    
    resetStatistics() {
        if (confirm('Êtes-vous sûr de vouloir réinitialiser toutes les statistiques ? Cette action supprimera tous les patients.')) {
            this.patients = {};
            this.statistics = this.initializeStatistics();
            this.stopAllTimers();
            this.saveUserData();
            this.renderPatients();
            this.updateStatistics();
        }
    }
    
    // Utility Functions
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    window.fastTrackersApp = new FastTrackersApp();
});

// PWA install prompt
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
});

window.addEventListener('appinstalled', () => {
    console.log('FastTrackers PWA was installed');
});

// Handle offline/online status
window.addEventListener('online', () => {
    console.log('App is online');
});

window.addEventListener('offline', () => {
    console.log('App is offline');
});
