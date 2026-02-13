/**
 * dashboard.js
 * -------------------------------------------------------
 * Dashboard-Komponente
 * Verwaltet Navigation, Profil-Dropdown und Seitenwechsel
 */

import { isLoggedIn, getUserLabel, logout } from './auth-adapter.js';
import { listPersons } from './person-service.js';
import { listOccasions } from './occasion-service.js';

/**
 * Dashboard-Klasse
 * Zentrale Verwaltung der Dashboard-UI
 */
class DashboardController {
  constructor() {
    this.currentSection = 'dashboard';
    this.userLabel = getUserLabel();
    
    // DOM-Elemente cachen
    this.profileMenuToggle = document.getElementById('profileMenuToggle');
    this.dropdownMenu = document.getElementById('dropdownMenu');
    this.navButtons = document.querySelectorAll('.nav-btn');
    this.contentArea = document.getElementById('contentArea');
    this.logoutBtn = document.getElementById('logoutBtn');
    this.profileSettings = document.getElementById('profileSettings');
    this.profileInfo = document.getElementById('profileInfo');

    this.init();
  }

  //Initialisierung
  init() {
    // Auth-Check
    if (!isLoggedIn()) {
      window.location.href = './login.html';
      return;
    }

    // Profil aktualisieren
    this.updateProfile();

    // Event-Listener registrieren
    this.registerEventListeners();

    console.log('Dashboard initialized');
  }

  //Profil aktualisieren
  updateProfile() {
    const nameDisplay = this.userLabel.split('@')[0]; // E-Mail vor @ nehmen
    const initials = nameDisplay
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase();

    document.getElementById('profileName').textContent = nameDisplay;
    document.getElementById('profileAvatar').textContent = initials;
    document.getElementById('welcomeName').textContent = nameDisplay;
  }

  //Event-Listener registrieren
  registerEventListeners() {
    // Profil-Dropdown toggle
    this.profileMenuToggle.addEventListener('click', () => {
      this.dropdownMenu.classList.toggle('show');
    });

    // Dropdown schließen wenn außerhalb geklickt wird
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.profile-dropdown')) {
        this.dropdownMenu.classList.remove('show');
      }
    });

    // Navigation
    this.navButtons.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const section = e.currentTarget.dataset.section;
        await this.switchSection(section);
      });
    });

    // Logout
    this.logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await this.handleLogout();
    });

    // Profil-Einstellungen
    this.profileSettings.addEventListener('click', (e) => {
      e.preventDefault();
      this.showSection('Einstellungen', 'Profileinstellungen werden hier angezeigt.');
      this.dropdownMenu.classList.remove('show');
    });

    // Profil-Info
    this.profileInfo.addEventListener('click', (e) => {
      e.preventDefault();
      this.showSection('Profil', `Email: ${this.userLabel}`);
      this.dropdownMenu.classList.remove('show');
    });
  }

  //Sektion wechseln
  async switchSection(section) {
    this.currentSection = section;

    // Active-Status aktualisieren
    this.navButtons.forEach(btn => {
      btn.classList.remove('active');
      if (btn.dataset.section === section) {
        btn.classList.add('active');
      }
    });

    // Inhalt anzeigen
    await this.renderSection(section);
  }

  //Sektion rendern
  async renderSection(section) {
    // Loading-State anzeigen
    this.contentArea.innerHTML = `
      <div style="text-align: center;">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">Wird geladen...</span>
        </div>
        <p class="mt-3 text-muted">Wird geladen...</p>
      </div>
    `;

    try {
      if (section === 'dashboard') {
        this.renderDashboard();
      } else if (section === 'persons') {
        await this.renderPersonsList();
      } else if (section === 'occasions') {
        await this.renderOccasionsList();
      } else if (section === 'gifts') {
        this.renderGiftsList();
      }
    } catch (err) {
      console.error('Fehler beim Laden der Sektion:', err);
      this.contentArea.innerHTML = `
        <div class="alert alert-danger">
          <i class="bi bi-exclamation-circle"></i> Fehler beim Laden: ${err.message}
        </div>
      `;
    }
  }

  //Dashboard-Übersicht
  renderDashboard() {
    this.contentArea.innerHTML = `
      <div style="text-align: center;">
        <i class="bi bi-speedometer2" style="font-size: 3rem; color: #3498db; margin-bottom: 1rem;"></i>
        <h5>Dashboard Übersicht</h5>
        <p class="text-muted">Wähle einen Punkt aus der Navigation, um Personen, Anlässe oder Geschenke zu verwalten.</p>
      </div>
    `;
  }

  //Personen-Liste laden und anzeigen
  async renderPersonsList() {
    const persons = await listPersons();

    if (!persons.length) {
      this.contentArea.innerHTML = `
        <div class="text-center">
          <i class="bi bi-people" style="font-size: 3rem; color: #9b59b6; margin-bottom: 1rem;"></i>
          <h5>Keine Personen vorhanden</h5>
          <p class="text-muted">Füge deine ersten Personen hinzu.</p>
          <button class="btn btn-primary mt-3" onclick="alert('TODO: Modal für Person hinzufügen')">
            <i class="bi bi-plus-circle"></i> Person hinzufügen
          </button>
        </div>
      `;
      return;
    }

    let html = `
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h5><i class="bi bi-people"></i> Personen (${persons.length})</h5>
        <button class="btn btn-sm btn-primary" onclick="alert('TODO: Modal für Person hinzufügen')">
          <i class="bi bi-plus-circle"></i> Hinzufügen
        </button>
      </div>
      <div class="list-group">
    `;

    persons.forEach(person => {
      const birthday = person.birthday ? `📅 ${person.birthday}` : 'Kein Geburtstag';
      const info = person.info || '—';

      html += `
        <div class="list-group-item">
          <div class="d-flex w-100 justify-content-between align-items-start">
            <div style="flex: 1;">
              <h6 class="mb-1">
                <i class="bi bi-person-fill" style="color: #9b59b6;"></i>
                ${person.name}
              </h6>
              <p class="mb-1 small text-muted">${birthday}</p>
              <p class="mb-0 small">Info: ${info}</p>
            </div>
            <div class="btn-group btn-group-sm" role="group">
              <button type="button" class="btn btn-outline-warning" onclick="alert('TODO: Edit Person ${person.id}')">
                <i class="bi bi-pencil"></i>
              </button>
              <button type="button" class="btn btn-outline-danger" onclick="alert('TODO: Delete Person ${person.id}')">
                <i class="bi bi-trash"></i>
              </button>
            </div>
          </div>
        </div>
      `;
    });

    html += `</div>`;
    this.contentArea.innerHTML = html;
  }

  //Anlässe-Liste laden und anzeigen
  async renderOccasionsList() {
    const occasions = await listOccasions();

    if (!occasions.length) {
      this.contentArea.innerHTML = `
        <div class="text-center">
          <i class="bi bi-calendar-event" style="font-size: 3rem; color: #e74c3c; margin-bottom: 1rem;"></i>
          <h5>Keine Anlässe vorhanden</h5>
          <p class="text-muted">Erstelle deine ersten Anlässe.</p>
          <button class="btn btn-primary mt-3" onclick="alert('TODO: Modal für Anlass hinzufügen')">
            <i class="bi bi-plus-circle"></i> Anlass hinzufügen
          </button>
        </div>
      `;
      return;
    }

    let html = `
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h5><i class="bi bi-calendar-event"></i> Anlässe (${occasions.length})</h5>
        <button class="btn btn-sm btn-primary" onclick="alert('TODO: Modal für Anlass hinzufügen')">
          <i class="bi bi-plus-circle"></i> Hinzufügen
        </button>
      </div>
      <div class="list-group">
    `;

    occasions.forEach(occasion => {
      const typeLabel = occasion.type === 'fixed' ? '🔒 Fest' : '📌 Frei';
      const status = occasion.isActive === false ? '<span class="badge bg-secondary ms-2">Inaktiv</span>' : '';

      html += `
        <div class="list-group-item">
          <div class="d-flex w-100 justify-content-between align-items-start">
            <div style="flex: 1;">
              <h6 class="mb-1">
                <i class="bi bi-calendar2-event" style="color: #e74c3c;"></i>
                ${occasion.name}
              </h6>
              <p class="mb-0 small text-muted">${typeLabel} ${status}</p>
            </div>
            <div class="btn-group btn-group-sm" role="group">
              <button type="button" class="btn btn-outline-info" onclick="alert('TODO: Toggle Occasion ${occasion.id}')">
                ${occasion.isActive === false ? '✓ Aktivieren' : '✕ Deaktivieren'}
              </button>
              <button type="button" class="btn btn-outline-warning" onclick="alert('TODO: Edit Occasion ${occasion.id}')">
                <i class="bi bi-pencil"></i>
              </button>
              ${occasion.type !== 'fixed' ? `
                <button type="button" class="btn btn-outline-danger" onclick="alert('TODO: Delete Occasion ${occasion.id}')">
                  <i class="bi bi-trash"></i>
                </button>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    });

    html += `</div>`;
    this.contentArea.innerHTML = html;
  }

  //Geschenke-Liste Placeholder
  renderGiftsList() {
    this.contentArea.innerHTML = `
      <div class="text-center">
        <i class="bi bi-gift" style="font-size: 3rem; color: #f39c12; margin-bottom: 1rem;"></i>
        <h5>Geschenke</h5>
        <p class="text-muted">Diese Funktion kommt bald...</p>
        <button class="btn btn-primary mt-3" disabled>
          <i class="bi bi-plus-circle"></i> Geschenk hinzufügen (In Arbeit)
        </button>
      </div>
    `;
  }

  //Logout-Handler
  async handleLogout() {
    try {
      await logout();
      window.location.href = './login.html';
    } catch (err) {
      console.error('Logout Error:', err);
      alert('Fehler beim Abmelden');
    }
  }
}

// Dashboard initialisieren wenn Seite geladen ist
document.addEventListener('DOMContentLoaded', () => {
  new DashboardController();
});