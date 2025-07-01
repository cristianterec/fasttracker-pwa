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
        
        this.dispositionOptions = [
            'Retour à domicile',
            'Hospitalisation',
            'Supprimer le patient'
        ];
        
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
        // Login events - Fixed binding
        const loginButtons = document.querySelectorAll('.login-btn');
        loginButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                console.log('Login button clicked'); // Debug log
                const user = e.currentTarget.getAttribute('data-user');
                console.log('User selected:', user); // Debug log
                this.login(user);
            });
        });
        
        // Logout event
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                this.logout();
            });
        }
        
        // Navigation events
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabName = e.currentTarget.dataset.tab;
                this.switchTab(tabName);
            });
        });
        
        // Patient management events
        const addPatientBtn = document.getElementById('add-patient-btn');
        if (addPatientBtn) {
            addPatientBtn.addEventListener('click', () => {
                this.showPatientModal();
            });
        }
        
        const patientForm = document.getElementById('patient-form');
        if (patientForm) {
            patientForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.savePatient();
            });
        }
        
        // Modal events
        const modalClose = document.getElementById('modal-close');
        if (modalClose) {
            modalClose.addEventListener('click', () => {
                this.hidePatientModal();
            });
        }
        
        const cancelBtn = document.getElementById('cancel-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                this.hidePatientModal();
            });
        }
        
        // Task management events
        const taskForm = document.getElementById('task-form');
        if (taskForm) {
            taskForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveTask();
            });
        }
        
        const taskModalClose = document.getElementById('task-modal-close');
        if (taskModalClose) {
            taskModalClose.addEventListener('click', () => {
                this.hideTaskModal();
            });
        }
        
        const taskCancelBtn = document.getElementById('task-cancel-btn');
        if (taskCancelBtn) {
            taskCancelBtn.addEventListener('click', () => {
                this.hideTaskModal();
            });
        }
        
        const timerCheckbox = document.getElementById('task-timer-enabled');
        if (timerCheckbox) {
            timerCheckbox.addEventListener('change', (e) => {
                const timerGroup = document.getElementById('timer-group');
                if (timerGroup) {
                    timerGroup.style.display = e.target.checked ? 'block' : 'none';
                }
            });
        }
        
        // Statistics events
        const resetStatsBtn = document.getElementById('reset-stats-btn');
        if (resetStatsBtn) {
            resetStatsBtn.addEventListener('click', () => {
                this.resetStatistics();
            });
        }
        
        // Close modals on outside click
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.hidePatientModal();
                this.hideTaskModal();
            }
        });
    }
    
    // Authentication
    login(user) {
        console.log('Login called with user:', user); // Debug log
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
        console.log('Showing login screen'); // Debug log
        const loginScreen = document.getElementById('login-screen');
        const mainScreen = document.getElementById('main-screen');
        
        if (loginScreen) loginScreen.classList.add('active');
        if (mainScreen) mainScreen.classList.remove('active');
    }
    
    showMainScreen() {
        console.log('Showing main screen'); // Debug log
        const loginScreen = document.getElementById('login-screen');
        const mainScreen = document.getElementById('main-screen');
        
        if (loginScreen) loginScreen.classList.remove('active');
        if (mainScreen) mainScreen.classList.add('active');
    }
    
    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        const activeTab = document.querySelector(`[data-tab="${tabName}"]`);
        if (activeTab) activeTab.classList.add('active');
        
        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        const activeContent = document.getElementById(`${tabName}-tab`);
        if (activeContent) activeContent.classList.add('active');
        
        if (tabName === 'statistics') {
            this.updateStatistics();
        }
    }
    
    updateUI() {
        const userHeader = document.getElementById('current-user');
        if (userHeader) {
            userHeader.textContent = `FastTrackers - ${this.currentUser}`;
        }
        this.renderPatients();
        this.updateStatistics();
    }
    
    // Patient Management
    showPatientModal(patientId = null) {
        this.currentPatientId = patientId;
        const modal = document.getElementById('patient-modal');
        const title = document.getElementById('modal-title');
        const form = document.getElementById('patient-form');
        
        if (!modal || !title || !form) return;
        
        if (patientId) {
            title.textContent = 'Modifier Patient';
            const patient = this.patients[patientId];
            if (patient) {
                document.getElementById('patient-name').value = patient.name;
                document.getElementById('patient-complaint').value = patient.complaint;
                document.getElementById('patient-triage').value = patient.triage;
                document.getElementById('patient-room').value = patient.room || '';
                document.getElementById('patient-nurse').value = patient.nurse || '';
            }
        } else {
            title.textContent = 'Ajouter Patient';
            form.reset();
        }
        
        modal.classList.add('active');
    }
    
    hidePatientModal() {
        const modal = document.getElementById('patient-modal');
        if (modal) {
            modal.classList.remove('active');
        }
        this.currentPatientId = null;
    }
    
    savePatient() {
        const nameField = document.getElementById('patient-name');
        const complaintField = document.getElementById('patient-complaint');
        const triageField = document.getElementById('patient-triage');
        const roomField = document.getElementById('patient-room');
        const nurseField = document.getElementById('patient-nurse');
        
        if (!nameField || !complaintField || !triageField) return;
        
        const name = nameField.value.trim();
        const complaint = complaintField.value.trim();
        const triage = triageField.value;
        const room = roomField ? roomField.value.trim() : '';
        const nurse = nurseField ? nurseField.value.trim() : '';
        
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
    
    renderPatients() {
        const grid = document.getElementById('patients-grid');
        if (!grid) return;
        
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
                        <span>${task.description}</span>
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
                    <div class="patient-meta">
                        ${patient.room ? `<span>📍 ${patient.room}</span>` : ''}
                        ${patient.nurse ? `<span>👤 ${patient.nurse}</span>` : ''}
                    </div>
                </div>
                <div class="patient-body">
                    ${tasksHtml}
                    <div class="patient-actions">
                        <button class="action-btn action-btn--task" data-action="add-task" data-patient-id="${patient.id}">
                            + Tâche
                        </button>
                        <div class="dropdown">
                            <button class="action-btn action-btn--disposition" data-action="disposition" data-patient-id="${patient.id}">
                                Disposition
                            </button>
                            <div class="dropdown-content">
                                <button class="dropdown-item" data-action="discharge" data-patient-id="${patient.id}">
                                    Retour à domicile
                                </button>
                                <button class="dropdown-item" data-action="admit" data-patient-id="${patient.id}">
                                    Hospitalisation
                                </button>
                                <button class="dropdown-item danger" data-action="delete" data-patient-id="${patient.id}">
                                    Supprimer le patient
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    bindPatientEvents() {
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
        const form = document.getElementById('task-form');
        const timerGroup = document.getElementById('timer-group');
        
        if (!modal || !form) return;
        
        form.reset();
        if (timerGroup) timerGroup.style.display = 'none';
        modal.classList.add('active');
    }
    
    hideTaskModal() {
        const modal = document.getElementById('task-modal');
        if (modal) {
            modal.classList.remove('active');
        }
        this.currentPatientId = null;
    }
    
    saveTask() {
        const descField = document.getElementById('task-description');
        const timerCheckbox = document.getElementById('task-timer-enabled');
        const minutesField = document.getElementById('timer-minutes');
        const secondsField = document.getElementById('timer-seconds');
        
        if (!descField) return;
        
        const description = descField.value.trim();
        const timerEnabled = timerCheckbox ? timerCheckbox.checked : false;
        const minutes = minutesField ? parseInt(minutesField.value) || 0 : 0;
        const seconds = secondsField ? parseInt(secondsField.value) || 0 : 0;
        
        if (!description) {
            alert('Veuillez saisir une description de tâche.');
            return;
        }
        
        const taskId = this.generateId();
        const task = {
            id: taskId,
            description,
            createdAt: new Date().toISOString()
        };
        
        if (timerEnabled && (minutes > 0 || seconds > 0)) {
            const totalSeconds = minutes * 60 + seconds;
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
    
    // Timer Management
    startPatientTimers() {
        // Stop existing timers
        this.stopAllTimers();
        
        // Start new timers
        Object.values(this.patients).forEach(patient => {
            if (patient.tasks) {
                patient.tasks.forEach(task => {
                    if (task.timer && task.timer.remaining > 0) {
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
        const elements = {
            'total-patients': stats.totalPatients,
            'active-patients': stats.activePatients,
            'discharged-patients': stats.dischargedPatients,
            'admitted-patients': stats.admittedPatients,
            'red-patients': stats.redPatients,
            'orange-patients': stats.orangePatients,
            'yellow-patients': stats.yellowPatients,
            'green-patients': stats.greenPatients,
            'blue-patients': stats.bluePatients,
            'purple-patients': stats.purplePatients
        };
        
        Object.keys(elements).forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = elements[id];
            }
        });
        
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
    console.log('DOM loaded, initializing FastTrackers app');
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
