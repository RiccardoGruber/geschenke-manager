/**
 * dashboard.js
 * -------------------------------------------------------
 * Dashboard-Controller (Shell)
 * Verwaltet Navigation, Profil-Dropdown und delegiert Rendering an Section-Module
 * 
 * Section-Module:
 *  - dashboard-section.js: KPI Cards, Upcoming Occasions, Quick Actions
 *  - persons-section.js: Persons List
 *  - occasions-section.js: Occasions List
 *  - gifts-section.js: Gifts Placeholder
 */

import { waitForUserOnce, getUserLabelUnified, logoutUnified } from './auth-adapter.js';
import * as dashboardSection from './sections/dashboard-section.js';
import * as personsSection from './sections/persons-section.js';
import * as occasionsSection from './sections/occasions-section.js';
import * as giftsSection from './sections/gifts-section.js';

/**
 * DashboardController (Shell)
 * Lightweight router that loads sections and manages tab switching
 */
class DashboardController {
  constructor() {
    this.currentSection = 'dashboard';
    this.currentSectionModule = null;
    this.userLabel = user.email || user.uid;
    
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

  // Initialisierung
async init() {
  const user = await waitForUserOnce();
  if (!user) {
    window.location.href = './login.html';
    return;
  }

  this.userLabel = getUserLabelUnified();

  this.updateProfile();
  this.registerEventListeners();
  this.switchSection('dashboard');

  console.log('Dashboard initialized');
}


  // Helper: Set page header/welcome section
  setPageHeader(title, description) {
    const welcomeBox = document.querySelector('.dashboard-welcome');
    if (welcomeBox) {
      welcomeBox.innerHTML = `
        <h3>${title}</h3>
        <p class="text-muted mb-0">${description}</p>
      `;
    }
  }

  // Reset to default welcome message
  resetPageHeader() {
    const welcomeBox = document.querySelector('.dashboard-welcome');
    if (welcomeBox) {
      welcomeBox.innerHTML = `<h1>Willkommen zurück, <span id="welcomeName">${this.userLabel.split('@')[0]}</span>!</h1>`;
    }
  }

  // Profil aktualisieren
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

  // Event-Listener registrieren
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
      this.setPageHeader('Einstellungen', 'Profileinstellungen werden hier angezeigt.');
      this.dropdownMenu.classList.remove('show');
    });

    // Profil-Info
    this.profileInfo.addEventListener('click', (e) => {
      e.preventDefault();
      this.setPageHeader('Profil', `Email: ${this.userLabel}`);
      this.dropdownMenu.classList.remove('show');
    });
  }

  // Sektion wechseln
  async switchSection(section) {
    this.currentSection = section;

    // Cleanup old section if exists
    if (this.currentSectionModule && this.currentSectionModule.destroy) {
      this.currentSectionModule.destroy();
    }

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

  // Sektion rendern
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
      // Context für Sections
      const ctx = {
        userLabel: this.userLabel,
        setPageHeader: (title, description) => this.setPageHeader(title, description),
        resetPageHeader: () => this.resetPageHeader(),
        navigate: (section) => this.switchSection(section)
      };

      // Select appropriate section module
      if (section === 'dashboard') {
        this.currentSectionModule = dashboardSection;
        this.resetPageHeader();
        await dashboardSection.render(this.contentArea, ctx);
      } else if (section === 'persons') {
        this.currentSectionModule = personsSection;
        await personsSection.render(this.contentArea, ctx);
      } else if (section === 'occasions') {
        this.currentSectionModule = occasionsSection;
        await occasionsSection.render(this.contentArea, ctx);
      } else if (section === 'gifts') {
        this.currentSectionModule = giftsSection;
        giftsSection.render(this.contentArea, ctx);
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

  // Logout-Handler
  async handleLogout() {
    try {
      await logoutUnified();
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
