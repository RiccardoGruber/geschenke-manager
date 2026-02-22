/**
 * dashboard.js
 * -------------------------------------------------------
 */

import "./firebase-config.js";
import { isAuthed, getUserLabelUnified, logoutUnified, waitForUserOnce } from './auth-adapter.js';
import * as dashboardSection from './sections/dashboard-section.js';
import * as personsSection   from './sections/persons-section.js';
import * as occasionsSection from './sections/occasions-section.js';
import * as giftsSection     from './sections/gifts-section.js';
import * as settingsSection  from './sections/settings-section.js';

// Section-Map für sauberes Routing ohne If-Kette
const SECTIONS = {
  dashboard: dashboardSection,
  persons:   personsSection,
  occasions: occasionsSection,
  gifts:     giftsSection,
  settings:  settingsSection,
};

class DashboardController {
  constructor() {
    this.currentSection       = null;
    this.currentSectionModule = null;
    this.currentParams        = {};

    // DOM-Referenzen cachen
    this.profileMenuToggle = document.getElementById('profileMenuToggle');
    this.dropdownMenu      = document.getElementById('dropdownMenu');
    this.navButtons        = document.querySelectorAll('.nav-btn');
    this.contentArea       = document.getElementById('contentArea');
    this.logoutBtn         = document.getElementById('logoutBtn');
    this.profileSettings   = document.getElementById('profileSettings');

    this.init();
  }

  async init() {
    const user = await waitForUserOnce();
    if (!user) {
      window.location.href = './login.html';
      return;
    }

    this.updateProfile();
    this.registerEventListeners();

    const startSection = localStorage.getItem('defaultSection') || 'dashboard';
    this.switchSection(startSection);
  }

  // ---- Header ----

  setPageHeader(title, description) {
    const welcomeBox = document.querySelector('.dashboard-welcome');
    if (!welcomeBox) return;
    welcomeBox.innerHTML = `
      <h3>${title}</h3>
      <p class="text-muted mb-0">${description}</p>
    `;
  }

  resetPageHeader() {
    const welcomeBox = document.querySelector('.dashboard-welcome');
    if (!welcomeBox) return;
    welcomeBox.innerHTML = `<h1>Willkommen zurück!</h1>`;
  }

  // ---- Profile ----

  updateProfile() {
    const profileName   = document.getElementById("profileName");
    const profileAvatar = document.getElementById("profileAvatar");

    if (!profileName || !profileAvatar) {
      console.warn("Profile elements missing", { profileName, profileAvatar });
      return;
    }

    const stored      = localStorage.getItem('displayName');
    const fallback    = (getUserLabelUnified() || "User").split("@")[0] || 'Benutzer';
    const nameDisplay = (stored !== null && stored !== '') ? stored : fallback;

    const initials = nameDisplay
      .split(" ")
      .filter(Boolean)
      .map(n => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

    profileName.textContent   = nameDisplay;
    profileAvatar.textContent = initials;
  }

  // ---- Events ----

  registerEventListeners() {
    // Profil-Dropdown toggle
    this.profileMenuToggle.addEventListener('click', () => {
      this.dropdownMenu.classList.toggle('show');
    });

    // Dropdown schließen bei Klick außerhalb
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.profile-dropdown')) {
        this.dropdownMenu.classList.remove('show');
      }
    });

    // Navigation
    this.navButtons.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        await this.switchSection(e.currentTarget.dataset.section);
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
      this.dropdownMenu.classList.remove('show');
      this.switchSection('settings');
    });
  }

  // ---- Navigation ----

  async switchSection(section, params = {}) {
    this.currentSection = section;
    this.currentParams  = params || {};

    if (this.currentSectionModule?.destroy) {
      this.currentSectionModule.destroy();
    }

    this.navButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.section === section);
    });

    await this.renderSection(section);
  }

  async renderSection(section) {
    this.contentArea.innerHTML = `
      <div class="text-center">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">Wird geladen...</span>
        </div>
        <p class="mt-3 text-muted">Wird geladen...</p>
      </div>
    `;

    const ctx = {
      setPageHeader:  (title, description) => this.setPageHeader(title, description),
      resetPageHeader: () => this.resetPageHeader(),
      navigate:       (sec, params) => this.switchSection(sec, params),
      params:         this.currentParams || {},
      updateProfile:  () => this.updateProfile(),
    };

    const module = SECTIONS[section];
    if (!module) return;

    try {
      this.currentSectionModule = module;

      if (section === 'dashboard') this.resetPageHeader();

      await module.render(this.contentArea, ctx);
    } catch (err) {
      console.error('Fehler beim Laden der Sektion:', err);
      this.contentArea.innerHTML = `
        <div class="alert alert-danger">
          <i class="bi bi-exclamation-circle"></i> Fehler beim Laden: ${err.message}
        </div>
      `;
    }
  }

  // ---- Logout ----

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

document.addEventListener('DOMContentLoaded', () => {
  new DashboardController();
});
