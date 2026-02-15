/**
 * occasions-section.js
 * -------------------------------------------------------
 * Anlässe-Verwaltung mit zweispaltiger/Tab-basierter UI
 * Desktop: Links Liste mit Filtern, Rechts Formular + Details
 * Mobile: Tabs (Liste / Bearbeiten)
 */

import { listOccasions, createOccasion, updateOccasion, deleteOccasion, ensureDefaultOccasions } from '../occasion-service.js';
import { listPersons as getPersonsList } from '../person-service.js';
import { waitForUserOnce, isAuthed, USE_FIREBASE_AUTH } from '../auth-adapter.js';

// DEV flag: Wenn true -> nutze Mock-Fallback automatisch (nur zu Entwicklung)
const USE_MOCK = false;

let allOccasions = [];
let filteredOccasions = [];
let allPersons = [];
let editingId = null;
let eventListeners = [];

// Filter state
let filters = {
  timeframe: '30',  // '30', '90', 'all'
  type: 'all',      // 'all', 'fixed', 'custom'
  status: 'all'     // 'all', 'active', 'inactive'
};

function _isoDateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function _formatDate(dateStr) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('de-DE', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch (e) {
    return dateStr;
  }
}

function _daysUntil(dateStr) {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = d - now;
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  } catch (e) {
    return null;
  }
}

export async function render(container, ctx) {
  ctx.setPageHeader('Anlässe verwalten', 'Verwalte wichtige Anlässe und Termine. Markiere regelmäßige Anlässe wie Geburtstage und erstelle eigene Erinnerungen.');

  // If not authed (UI or Firebase depending on flag), show warning and stop.
  if (!isAuthed()) {
    container.innerHTML = `
      <div class="alert alert-warning">
        <h6 class="alert-heading">Nicht eingeloggt</h6>
        <p>Um Anlässe zu verwalten musst du eingeloggt sein.</p>
        <a class="btn btn-sm btn-primary" href="./login.html">Zum Login</a>
      </div>
    `;
    return;
  }

  // Load occasions (echte Daten). Only call ensureDefaultOccasions when using real Firebase Auth
  try {
    if (USE_FIREBASE_AUTH && isAuthed()) {
      await ensureDefaultOccasions();
    }
    allOccasions = await listOccasions();
    if ((!allOccasions || allOccasions.length === 0) && USE_MOCK) {
      allOccasions = [];
    }
  } catch (err) {
    console.warn('Fehler beim Laden von Anlässen:', err);
    if (USE_MOCK) {
      allOccasions = [];
    } else {
      container.innerHTML = `
        <div class="alert alert-warning">
          Anlässe konnten nicht geladen werden. Bitte einloggen oder versuche es später.
          <div class="mt-2"><a class="btn btn-sm btn-primary" href="./login.html">Zum Login</a></div>
        </div>
      `;
      return;
    }
  }

  // Load persons for dropdown (optional)
  try {
    allPersons = await getPersonsList();
  } catch (err) {
    console.warn('Fehler beim Laden von Personen:', err);
    allPersons = [];
  }

  filteredOccasions = [...allOccasions];

  // Render main layout
  container.innerHTML = `
    <div class="occasions-manager">
      <!-- Tab Navigation (Mobile only) -->
      <div class="occasions-tabs d-lg-none mb-3">
        <button class="occasions-tab-btn active" data-tab="list">
          <i class="bi bi-list-ul"></i> Liste
        </button>
        <button class="occasions-tab-btn" data-tab="edit">
          <i class="bi bi-calendar-plus"></i> Bearbeiten
        </button>
      </div>

      <div class="occasions-content">
        <!-- Left: Occasion List -->
        <div class="occasions-list-container" id="listContainer">
          <div class="occasions-list-header">
            <h5 class="mb-0"><i class="bi bi-calendar-event"></i> Anlässe <span class="badge bg-light text-dark">${filteredOccasions.length}</span></h5>
            <button class="btn btn-sm btn-primary" id="addOccasionBtn">
              <i class="bi bi-plus-circle"></i> Anlass hinzufügen
            </button>
          </div>

          <!-- Search -->
          <div class="occasions-search mb-3">
            <input 
              type="text" 
              class="form-control form-control-sm" 
              id="searchInput" 
              placeholder="Nach Name oder Person suchen..."
            >
          </div>

          <!-- Filters -->
          <div class="occasions-filters mb-3">
            <div class="filter-group">
              <label class="filter-label">
                <i class="bi bi-hourglass-split"></i> Zeitraum
              </label>
              <select class="form-select form-select-sm" id="filterTimeframe">
                <option value="30">Nächste 30 Tage</option>
                <option value="90">Nächste 90 Tage</option>
                <option value="all">Alle</option>
              </select>
            </div>

            <div class="filter-group">
              <label class="filter-label">
                <i class="bi bi-tag"></i> Typ
              </label>
              <select class="form-select form-select-sm" id="filterType">
                <option value="all">Alle Typen</option>
                <option value="fixed">Fest (z.B. Geburtstag)</option>
                <option value="custom">Frei / Custom</option>
              </select>
            </div>

            <div class="filter-group">
              <label class="filter-label">
                <i class="bi bi-toggle-on"></i> Status
              </label>
              <select class="form-select form-select-sm" id="filterStatus">
                <option value="all">Alle</option>
                <option value="active">Aktiv</option>
                <option value="inactive">Deaktiviert</option>
              </select>
            </div>
          </div>

          <!-- Occasions List -->
          <div class="occasions-list" id="occasionsList"></div>
        </div>

        <!-- Right: Form & Details -->
        <div class="occasions-form-container d-lg-block" id="formContainer">
          <div class="occasions-form-content" id="formContent"></div>
        </div>
      </div>
    </div>
  `;

  // Initial renders
  applyFilters();
  renderOccasionsList();
  renderForm();

  // Attach event listeners
  attachEventListeners(ctx);
}

function applyFilters() {
  filteredOccasions = allOccasions.filter(o => {
    // Timeframe filter
    if (filters.timeframe !== 'all') {
      const days = _daysUntil(o.date);
      const maxDays = parseInt(filters.timeframe);
      if (days === null || days > maxDays) return false;
    }

    // Type filter
    if (filters.type !== 'all' && o.type !== filters.type) return false;

    // Status filter
    if (filters.status === 'active' && !o.isActive) return false;
    if (filters.status === 'inactive' && o.isActive) return false;

    return true;
  });

  // Sort by date
  filteredOccasions.sort((a, b) => {
    const dateA = new Date(a.date || '9999-12-31');
    const dateB = new Date(b.date || '9999-12-31');
    return dateA - dateB;
  });
}

function renderOccasionsList() {
  const listDiv = document.getElementById('occasionsList');
  
  if (!filteredOccasions || filteredOccasions.length === 0) {
    listDiv.innerHTML = `
      <div class="occasions-empty-state">
        <i class="bi bi-inbox"></i>
        <h6>Keine Anlässe gefunden</h6>
        <p class="text-muted small">Erstelle deinen ersten Anlass mit "<strong>Anlass hinzufügen</strong>".</p>
      </div>
    `;
    return;
  }

  listDiv.innerHTML = filteredOccasions.map(occasion => {
    const isActive = editingId === occasion.id;
    const daysUntil = _daysUntil(occasion.date);
    const daysLabel = daysUntil !== null ? 
      (daysUntil === 0 ? '📌 Heute!' : 
       daysUntil === 1 ? '⏰ Morgen!' : 
       daysUntil > 0 ? `in ${daysUntil}d` : 'vorbei') : '';
    
    return `
      <div class="occasion-card ${isActive ? 'active' : ''}" data-occasion-id="${occasion.id}">
        <div class="occasion-card-main">
          <div class="occasion-card-content">
            <h6 class="occasion-title">${occasion.name}</h6>
            <p class="occasion-meta">
              <span>${occasion.person || '—'}</span>
              <span class="occasion-badge-group">
                <span class="occasion-badge ${occasion.type === 'fixed' ? 'badge-fixed' : 'badge-custom'}">
                  ${occasion.type === 'fixed' ? '🔒 Fest' : '📌 Frei'}
                </span>
                ${!occasion.isActive ? '<span class="occasion-badge badge-inactive">⊗ Inaktiv</span>' : ''}
              </span>
            </p>
          </div>
          <div class="occasion-date">
            <div class="occasion-date-main">${_formatDate(occasion.date)}</div>
            ${daysLabel ? `<div class="occasion-date-relative">${daysLabel}</div>` : ''}
          </div>
        </div>
        <div class="occasion-card-actions">
          <button class="occasion-action-btn occasion-toggle-btn" title="${occasion.isActive ? 'Deaktivieren' : 'Aktivieren'}">
            <i class="bi ${occasion.isActive ? 'bi-toggle-on' : 'bi-toggle-off'}"></i>
          </button>
          <button class="occasion-action-btn occasion-delete-btn" title="Löschen">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function renderForm() {
  const formDiv = document.getElementById('formContent');

  if (editingId === null) {
    // New occasion form placeholder
    formDiv.innerHTML = `
      <div class="occasions-form-placeholder">
        <i class="bi bi-calendar-plus"></i>
        <h6>Neuer Anlass</h6>
        <p class="text-muted small">Wähle einen Anlass aus der Liste,<br>um ihn zu bearbeiten, oder click "Anlass hinzufügen".</p>
      </div>
    `;
  } else {
    // Edit occasion form
    const occasion = allOccasions.find(o => o.id === editingId);
    
    formDiv.innerHTML = `
      <form class="occasions-form" id="occasionForm">
        <h5><i class="bi bi-pencil-square"></i> ${editingId ? 'Bearbeiten' : 'Neu'}</h5>
        
        <div class="mb-3">
          <label for="formTitle" class="form-label">Anlass-Name <span class="text-danger">*</span></label>
          <input 
            type="text" 
            class="form-control" 
            id="formTitle" 
            value="${occasion?.name || ''}" 
            placeholder="z.B. Geburtstag Max" 
            required
          >
        </div>

        <div class="mb-3">
          <label for="formDate" class="form-label"><i class="bi bi-calendar"></i> Datum <span class="text-danger">*</span></label>
          <input 
            type="date" 
            class="form-control" 
            id="formDate" 
            value="${occasion?.date || ''}"
            required
          >
        </div>

        <div class="mb-3">
          <label for="formPerson" class="form-label">Person</label>
          <input 
            type="text" 
            class="form-control" 
            id="formPerson" 
            value="${occasion?.person || ''}"
            placeholder="z.B. Anna Müller"
            list="personsSuggestions"
          >
          <datalist id="personsSuggestions">
            ${allPersons.map(p => `<option value="${p.name}">`).join('')}
          </datalist>
        </div>

        <div class="mb-3">
          <label for="formType" class="form-label">Typ</label>
          <select class="form-select" id="formType">
            <option value="custom" ${occasion?.type === 'custom' ? 'selected' : ''}>Frei / Custom</option>
            <option value="fixed" ${occasion?.type === 'fixed' ? 'selected' : ''}>Fest (z.B. Geburtstag)</option>
          </select>
        </div>

        <div class="mb-3">
          <div class="form-check form-switch">
            <input 
              class="form-check-input" 
              type="checkbox" 
              id="formIsActive"
              ${occasion?.isActive !== false ? 'checked' : ''}
            >
            <label class="form-check-label" for="formIsActive">
              <i class="bi bi-toggle-on"></i> Aktiv
            </label>
          </div>
        </div>

        <div class="mb-3">
          <label for="formInfo" class="form-label">Notiz / Info</label>
          <textarea 
            class="form-control" 
            id="formInfo" 
            rows="2" 
            placeholder="Optionale Notizen..."
          >${occasion?.info || ''}</textarea>
        </div>

        <div class="occasions-form-actions">
          <button type="submit" class="btn btn-primary">
            <i class="bi bi-check-circle"></i> Speichern
          </button>
          <button type="reset" class="btn btn-outline-secondary" id="cancelBtn">
            <i class="bi bi-x-circle"></i> Abbrechen
          </button>
        </div>
      </form>
    `;
  }
}

function attachEventListeners(ctx) {
  // Remove old listeners
  eventListeners.forEach(({ element, event, handler }) => {
    if (element) element.removeEventListener(event, handler);
  });
  eventListeners = [];

  // Add New Occasion
  const addBtn = document.getElementById('addOccasionBtn');
  const handleAddClick = () => {
    editingId = null;
    renderForm();
    renderOccasionsList();
    // Show form tab on mobile
    document.querySelectorAll('.occasions-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector('[data-tab="edit"]')?.classList.add('active');
  };
  addBtn.addEventListener('click', handleAddClick);
  eventListeners.push({ element: addBtn, event: 'click', handler: handleAddClick });

  // Tab Navigation (Mobile)
  document.querySelectorAll('.occasions-tab-btn')?.forEach(tab => {
    const handler = (e) => {
      const tabName = e.target.closest('.occasions-tab-btn')?.dataset.tab;
      document.querySelectorAll('.occasions-tab-btn').forEach(b => b.classList.remove('active'));
      e.target.closest('.occasions-tab-btn')?.classList.add('active');
      
      if (tabName === 'list') {
        document.getElementById('listContainer').classList.remove('mobile-hidden');
        document.getElementById('formContainer').classList.add('mobile-hidden');
      } else {
        document.getElementById('listContainer').classList.add('mobile-hidden');
        document.getElementById('formContainer').classList.remove('mobile-hidden');
      }
    };
    tab.addEventListener('click', handler);
    eventListeners.push({ element: tab, event: 'click', handler });
  });

  // Search
  const searchInput = document.getElementById('searchInput');
  const handleSearch = () => {
    const term = searchInput.value.toLowerCase();
    filteredOccasions = allOccasions.filter(o => {
      const matchesSearch = (o.name && o.name.toLowerCase().includes(term)) || 
                           (o.person && o.person.toLowerCase().includes(term));
      return matchesSearch;
    });
    applyFilters();
    renderOccasionsList();
    attachOccasionCardListeners();
  };
  searchInput?.addEventListener('input', handleSearch);
  eventListeners.push({ element: searchInput, event: 'input', handler: handleSearch });

  // Filter changes
  const filterTimeframe = document.getElementById('filterTimeframe');
  const filterType = document.getElementById('filterType');
  const filterStatus = document.getElementById('filterStatus');
  
  const handleFilterChange = () => {
    filters.timeframe = filterTimeframe.value;
    filters.type = filterType.value;
    filters.status = filterStatus.value;
    applyFilters();
    renderOccasionsList();
    attachOccasionCardListeners();
  };
  
  filterTimeframe?.addEventListener('change', handleFilterChange);
  filterType?.addEventListener('change', handleFilterChange);
  filterStatus?.addEventListener('change', handleFilterChange);
  eventListeners.push({ element: filterTimeframe, event: 'change', handler: handleFilterChange });
  eventListeners.push({ element: filterType, event: 'change', handler: handleFilterChange });
  eventListeners.push({ element: filterStatus, event: 'change', handler: handleFilterChange });

  // Occasion Card Click
  attachOccasionCardListeners();

  // Form Submit
  const form = document.getElementById('occasionForm');
  if (form) {
    const handleSubmit = async (e) => {
      e.preventDefault();
      
      const title = document.getElementById('formTitle').value.trim();
      const date = document.getElementById('formDate').value;
      const person = document.getElementById('formPerson').value.trim();
      const type = document.getElementById('formType').value;
      const isActive = document.getElementById('formIsActive').checked;
      const info = document.getElementById('formInfo').value.trim();

      if (!title) {
        alert('Anlass-Name ist erforderlich!');
        return;
      }
      if (!date) {
        alert('Datum ist erforderlich!');
        return;
      }

      try {
        const userCheck = await waitForUserOnce();
        if (!userCheck) {
          alert('Bitte einloggen, um Anlässe zu speichern.');
          window.location.href = './login.html';
          return;
        }
        const btn = form.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Speichern...';

        if (editingId) {
          await updateOccasion(editingId, { name: title, date, person, type, info, isActive });
        } else {
          await createOccasion({ name: title, date, person, type, info });
        }

        // Reload list
        allOccasions = await listOccasions();
        applyFilters();
        editingId = null;
        
        renderOccasionsList();
        renderForm();
        attachOccasionCardListeners();
        
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-check-circle"></i> Speichern';
      } catch (err) {
        console.error('Fehler beim Speichern:', err);
        alert(`Fehler: ${err.message}`);
      }
    };
    form.addEventListener('submit', handleSubmit);
    eventListeners.push({ element: form, event: 'submit', handler: handleSubmit });

    // Cancel Button
    const cancelBtn = document.getElementById('cancelBtn');
    if (cancelBtn) {
      const handleCancel = () => {
        editingId = null;
        renderForm();
        renderOccasionsList();
      };
      cancelBtn.addEventListener('click', handleCancel);
      eventListeners.push({ element: cancelBtn, event: 'click', handler: handleCancel });
    }
  }
}

function attachOccasionCardListeners() {
  document.querySelectorAll('.occasion-card')?.forEach(card => {
    const mainHandler = () => {
      const occasionId = card.dataset.occasionId;
      editingId = occasionId;
      renderForm();
      renderOccasionsList();
      
      // On mobile, switch to form tab
      if (window.innerWidth < 992) {
        document.querySelectorAll('.occasions-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('[data-tab="edit"]')?.classList.add('active');
        document.getElementById('listContainer').classList.add('mobile-hidden');
        document.getElementById('formContainer').classList.remove('mobile-hidden');
      }
    };
    card.addEventListener('click', mainHandler);
    eventListeners.push({ element: card, event: 'click', handler: mainHandler });

    // Toggle active/inactive
    const toggleBtn = card.querySelector('.occasion-toggle-btn');
    if (toggleBtn) {
      const handleToggle = async (e) => {
        e.stopPropagation();
        const occasion = allOccasions.find(o => o.id === card.dataset.occasionId);
        try {
          toggleBtn.disabled = true;
          const userCheckToggle = await waitForUserOnce();
          if (!userCheckToggle) {
            alert('Bitte einloggen, um Anlässe zu ändern.');
            window.location.href = './login.html';
            return;
          }
          await updateOccasion(occasion.id, { isActive: !occasion.isActive });
          allOccasions = await listOccasions();
          applyFilters();
          renderOccasionsList();
          attachOccasionCardListeners();
          toggleBtn.disabled = false;
        } catch (err) {
          console.error('Fehler beim Toggeln:', err);
          alert(`Fehler: ${err.message}`);
          toggleBtn.disabled = false;
        }
      };
      toggleBtn.addEventListener('click', handleToggle);
      eventListeners.push({ element: toggleBtn, event: 'click', handler: handleToggle });
    }

    // Delete
    const deleteBtn = card.querySelector('.occasion-delete-btn');
    if (deleteBtn) {
      const handleDelete = async (e) => {
        e.stopPropagation();
        const occasion = allOccasions.find(o => o.id === card.dataset.occasionId);
        
        if (occasion.type === 'fixed') {
          alert('Feste Standard-Anlässe können nicht gelöscht werden.');
          return;
        }

        if (!confirm(`Möchtest du "${occasion.name}" wirklich löschen?`)) return;

        try {
          deleteBtn.disabled = true;
          deleteBtn.innerHTML = '<i class="bi bi-hourglass-split"></i>';
          
          const userCheckDelete = await waitForUserOnce();
          if (!userCheckDelete) {
            alert('Bitte einloggen, um Anlässe zu löschen.');
            window.location.href = './login.html';
            return;
          }
          await deleteOccasion(occasion.id);
          
          allOccasions = await listOccasions();
          applyFilters();
          editingId = null;
          
          renderOccasionsList();
          renderForm();
          attachOccasionCardListeners();
          
          deleteBtn.disabled = false;
          deleteBtn.innerHTML = '<i class="bi bi-trash"></i>';
        } catch (err) {
          console.error('Fehler beim Löschen:', err);
          alert(`Fehler: ${err.message}`);
          deleteBtn.disabled = false;
          deleteBtn.innerHTML = '<i class="bi bi-trash"></i>';
        }
      };
      deleteBtn.addEventListener('click', handleDelete);
      eventListeners.push({ element: deleteBtn, event: 'click', handler: handleDelete });
    }
  });
}

export function destroy() {
  eventListeners.forEach(({ element, event, handler }) => {
    if (element) element.removeEventListener(event, handler);
  });
  eventListeners = [];
  allOccasions = [];
  filteredOccasions = [];
  allPersons = [];
  editingId = null;
}
