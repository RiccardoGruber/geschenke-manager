/**
 * persons-section.js
 * -------------------------------------------------------
 * Personen-Verwaltung mit zweispaltiger/Tab-basierter UI
 * Desktop: Links Liste, Rechts Formular + Details
 * Mobile: Tabs (Liste / Bearbeiten)
 */

import { listPersons, createPerson, updatePerson, deletePerson } from '../person-service.js';
import { waitForUserOnce, isAuthed } from '../auth-adapter.js';
import { hasGiftIdeasByPerson } from '../gift-idea-service.js';
import { hasGiftsByPerson } from '../gift-service.js';


let allPersons = [];
let filteredPersons = [];
let editingId = null;
let mode = 'none'; // 'none' | 'create' | 'edit'
let eventListeners = [];

export async function render(container, ctx) {
  ctx.setPageHeader('Personen verwalten', 'Verwalte hier alle wichtigen Personen. Du kannst neue Personen hinzufügen, bearbeiten oder löschen.');

  // If not authed, show warning and stop.
  if (!isAuthed()) {
    container.innerHTML = `
      <div class="alert alert-warning">
        <h6 class="alert-heading">Nicht eingeloggt</h6>
        <p>Um Personen zu verwalten musst du eingeloggt sein.</p>
        <a class="btn btn-sm btn-primary" href="./login.html">Zum Login</a>
      </div>
    `;
    return;
  }

  // Load persons
  try {
    allPersons = await listPersons();
    if ((!allPersons || allPersons.length === 0) && USE_MOCK) allPersons = mockPersons;
  } catch (err) {
    console.warn('Fehler beim Laden von Personen:', err);
    if (USE_MOCK) allPersons = mockPersons; else {
      container.innerHTML = `
        <div class="alert alert-warning">
          Personen konnten nicht geladen werden. Bitte einloggen oder später erneut versuchen.
          <div class="mt-2"><a class="btn btn-sm btn-primary" href="./login.html">Zum Login</a></div>
        </div>
      `;
      return;
    }
  }

  filteredPersons = [...allPersons];

  // Render main layout
  container.innerHTML = `
    <div class="persons-manager">
      <!-- Tab Navigation (Mobile only) -->
      <div class="persons-tabs d-lg-none mb-3">
        <button class="persons-tab-btn active" data-tab="list">
          <i class="bi bi-list-ul"></i> Liste
        </button>
        <button class="persons-tab-btn" data-tab="edit">
          <i class="bi bi-pencil-square"></i> Bearbeiten
        </button>
      </div>

      <div class="persons-content">
        <!-- Left: Person List (always visible on desktop) -->
        <div class="persons-list-container" id="listContainer">
          <div class="persons-list-header">
            <h5 class="mb-0"><i class="bi bi-people-fill"></i> Personen <span class="badge bg-light text-dark">${filteredPersons.length}</span></h5>
            <button class="btn btn-sm btn-primary" id="addPersonBtn">
              <i class="bi bi-plus-circle"></i> Neu
            </button>
          </div>

          <!-- Search & Filter -->
          <div class="persons-search mb-3">
            <input 
              type="text" 
              class="form-control form-control-sm" 
              id="searchInput" 
              placeholder="Personen suchen..."
            >
            <div class="persons-filter-toggle mt-2">
              <small>
                <input type="checkbox" id="filterBirthday" class="form-check-input">
                <label class="form-check-label" for="filterBirthday">
                  <i class="bi bi-calendar"></i> Mit Geburtstag
                </label>
              </small>
            </div>
          </div>

          <!-- Persons List -->
          <div class="persons-list" id="personsList"></div>
        </div>

        <!-- Right: Form & Details (hidden on mobile) -->
        <div class="persons-form-container d-lg-block" id="formContainer">
          <div class="persons-form-content" id="formContent"></div>
        </div>
      </div>
    </div>
  `;

  // Initial state
  mode = 'none';
  editingId = null;

  // Initial renders
  renderPersonsList();
  renderForm();
  bindFormEvents();


  // Attach event listeners
  attachEventListeners(ctx);
}

function renderPersonsList() {
  const listDiv = document.getElementById('personsList');
  
  if (!filteredPersons || filteredPersons.length === 0) {
    listDiv.innerHTML = `
      <div class="persons-empty-state">
        <i class="bi bi-inbox"></i>
        <h6>Keine Personen</h6>
        <p class="text-muted small">Klicke "<strong>Neu</strong>" um eine Person hinzuzufügen.</p>
      </div>
    `;
    return;
  }

  listDiv.innerHTML = filteredPersons.map(person => {
    const hasBirthday = person.birthday && person.birthday.trim() !== '';
    const isActive = editingId === person.id;
    
    return `
      <div class="person-card ${isActive ? 'active' : ''}" data-person-id="${person.id}">
        <div class="person-card-header">
          <div class="person-avatar">
            ${person.name.charAt(0).toUpperCase()}
          </div>
          <div class="person-card-info">
            <h6 class="person-name">${person.name}</h6>
            ${hasBirthday ? `<p class="person-birthday"><i class="bi bi-calendar"></i> ${person.birthday}</p>` : ''}
          </div>
        </div>
        ${person.info ? `<p class="person-info-text">${person.info}</p>` : ''}
      </div>
    `;
  }).join('');
}

function renderForm() {
  const formDiv = document.getElementById('formContent');

  if (mode === 'none') {
    formDiv.innerHTML = `
      <div class="persons-form-placeholder">
        <i class="bi bi-person-plus"></i>
        <h6>Person auswählen oder neu anlegen</h6>
        <p class="text-muted small">Wähle eine Person aus der Liste, um sie zu bearbeiten,<br>oder klick "Neu" um eine neue Person hinzuzufügen.</p>
      </div>
    `;
    return;
  }

  if (mode === 'create') {
    formDiv.innerHTML = `
      <form class="persons-form" id="personForm">
        <h5><i class="bi bi-person-plus"></i> Neu</h5>
        <div class="mb-3">
          <label for="formName" class="form-label">Name <span class="text-danger">*</span></label>
          <input type="text" class="form-control" id="formName" value="" placeholder="z.B. Anna Müller" required>
          <small class="text-muted">Pflichtfeld</small>
        </div>
        <div class="mb-3">
          <label for="formBirthday" class="form-label"><i class="bi bi-calendar"></i> Geburtstag</label>
          <input type="date" class="form-control" id="formBirthday" value="">
          <small class="text-muted">Optional</small>
        </div>
        <div class="mb-3">
          <label for="formInfo" class="form-label">Info / Notizen</label>
          <textarea class="form-control" id="formInfo" rows="3" placeholder="z.B. Schwester, Kollege..."></textarea>
          <small class="text-muted">Optional</small>
        </div>
        <div class="persons-form-actions">
          <button type="submit" class="btn btn-primary"><i class="bi bi-check-circle"></i> Speichern</button>
          <button type="reset" class="btn btn-outline-secondary" id="cancelBtn"><i class="bi bi-x-circle"></i> Abbrechen</button>
        </div>
      </form>
    `;
    return;
  }

  // edit mode
  const person = allPersons.find(p => p.id === editingId);
  formDiv.innerHTML = `
    <form class="persons-form" id="personForm">
      <h5><i class="bi bi-pencil-square"></i> Bearbeiten</h5>
      <div class="mb-3">
        <label for="formName" class="form-label">Name <span class="text-danger">*</span></label>
        <input type="text" class="form-control" id="formName" value="${person?.name || ''}" required>
        <small class="text-muted">Pflichtfeld</small>
      </div>
      <div class="mb-3">
        <label for="formBirthday" class="form-label"><i class="bi bi-calendar"></i> Geburtstag</label>
        <input type="date" class="form-control" id="formBirthday" value="${person?.birthday || ''}">
        <small class="text-muted">Optional</small>
      </div>
      <div class="mb-3">
        <label for="formInfo" class="form-label">Info / Notizen</label>
        <textarea class="form-control" id="formInfo" rows="3">${person?.info || ''}</textarea>
        <small class="text-muted">Optional</small>
      </div>
      <div class="persons-form-actions">
        <button type="submit" class="btn btn-primary"><i class="bi bi-check-circle"></i> Speichern</button>
        <button type="reset" class="btn btn-outline-secondary" id="cancelBtn"><i class="bi bi-x-circle"></i> Abbrechen</button>
        <button type="button" class="btn btn-outline-danger" id="deleteBtn"><i class="bi bi-trash"></i> Löschen</button>
      </div>
    </form>
  `;
}
function bindFormEvents() {
  // Form Submit
  const form = document.getElementById('personForm');
  if (!form) return;

  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log("PERSON SAVE HANDLER TRIGGERED"); // Debug

    const name = document.getElementById('formName').value.trim();
    const birthday = document.getElementById('formBirthday').value;
    const info = document.getElementById('formInfo').value.trim();

    if (!name) {
      alert('Name ist erforderlich!');
      return;
    }

    try {
      const userCheck = await waitForUserOnce();
      if (!userCheck) {
        alert('Bitte einloggen, um Personen zu speichern.');
        window.location.href = './login.html';
        return;
      }

      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Speichern...';

      if (mode === 'edit' && editingId) {
        await updatePerson(editingId, { name, birthday, info });
      } else if (mode === 'create') {
        await createPerson({ name, birthday, info });
      }

      allPersons = await listPersons();
      filteredPersons = [...allPersons];
      mode = 'none';
      editingId = null;

      renderPersonsList();
      renderForm();
      bindFormEvents();          // <<< WICHTIG: nach render wieder binden
      attachPersonCardListeners();

    } catch (err) {
      console.error('Fehler beim Speichern:', err);
      alert(`Fehler: ${err.message || err}`);
    }
  };

  form.addEventListener('submit', handleSubmit);
  eventListeners.push({ element: form, event: 'submit', handler: handleSubmit });

  // Cancel Button
  const cancelBtn = document.getElementById('cancelBtn');
  if (cancelBtn) {
    const handleCancel = (e) => {
      e.preventDefault();
      mode = 'none';
      editingId = null;
      renderForm();
      bindFormEvents();          // <<< WICHTIG
      renderPersonsList();
      attachPersonCardListeners();
    };
    cancelBtn.addEventListener('click', handleCancel);
    eventListeners.push({ element: cancelBtn, event: 'click', handler: handleCancel });
  }

  // Delete Button
  const deleteBtn = document.getElementById('deleteBtn');
  if (deleteBtn) {
    const handleDelete = async (e) => {
      e.preventDefault();
      if (!confirm(`Möchtest du "${document.getElementById('formName').value}" wirklich löschen?`)) return;

      try {
        const userCheck = await waitForUserOnce();
        if (!userCheck) {
          alert('Bitte einloggen, um Personen zu löschen.');
          window.location.href = './login.html';
          return;
        }

        deleteBtn.disabled = true;
        deleteBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Löschen...';

        // --- NEW: block delete if dependencies exist ---
        const [hasIdeas, hasGifts] = await Promise.all([
        hasGiftIdeasByPerson(editingId),
        hasGiftsByPerson(editingId)
        ]);

        if (hasIdeas || hasGifts) {
          alert('Diese Person kann nicht gelöscht werden, weil bereits Geschenkideen oder Geschenke existieren.');
          deleteBtn.disabled = false;
          deleteBtn.innerHTML = '<i class="bi bi-trash"></i> Löschen';
          return;
        }
        // --- END NEW ---

        await deletePerson(editingId);

        allPersons = await listPersons();
        filteredPersons = [...allPersons];
        mode = 'none';
        editingId = null;

        renderPersonsList();
        renderForm();
        bindFormEvents();        // <<< WICHTIG
        attachPersonCardListeners();

      } catch (err) {
        console.error('Fehler beim Löschen:', err);
        alert(`Fehler: ${err.message || err}`);
      }
    };

    deleteBtn.addEventListener('click', handleDelete);
    eventListeners.push({ element: deleteBtn, event: 'click', handler: handleDelete });
  }
}

function attachEventListeners(ctx) {
  // Remove old listeners
  eventListeners.forEach(({ element, event, handler }) => {
    if (element) element.removeEventListener(event, handler);
  });
  eventListeners = [];

  // Add New Person
  const addBtn = document.getElementById('addPersonBtn');
  const handleAddClick = () => {
    mode = 'create';
    editingId = null;
    renderForm();
    bindFormEvents();
    renderPersonsList();
    document.getElementById('listContainer').classList.add('mobile-hidden');
    document.getElementById('formContainer').classList.remove('mobile-hidden');
    // Show form tab on mobile
    document.querySelectorAll('.persons-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector('[data-tab="edit"]')?.classList.add('active');
  };
  addBtn.addEventListener('click', handleAddClick);
  eventListeners.push({ element: addBtn, event: 'click', handler: handleAddClick });

  // Tab Navigation (Mobile)
  document.querySelectorAll('.persons-tab-btn')?.forEach(tab => {
    const handler = (e) => {
      const tabName = e.target.closest('.persons-tab-btn')?.dataset.tab;
      document.querySelectorAll('.persons-tab-btn').forEach(b => b.classList.remove('active'));
      e.target.closest('.persons-tab-btn')?.classList.add('active');
      
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
  const filterCheckbox = document.getElementById('filterBirthday');
  
  const handleFilter = () => {
    const searchTerm = searchInput.value.toLowerCase();
    const onlyWithBirthday = filterCheckbox.checked;
    
    filteredPersons = allPersons.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchTerm) || 
                           (p.info && p.info.toLowerCase().includes(searchTerm));
      const matchesBirthdayFilter = !onlyWithBirthday || (p.birthday && p.birthday.trim() !== '');
      return matchesSearch && matchesBirthdayFilter;
    });
    
    renderPersonsList();
    attachPersonCardListeners();
  };
  
  searchInput?.addEventListener('input', handleFilter);
  filterCheckbox?.addEventListener('change', handleFilter);
  eventListeners.push({ element: searchInput, event: 'input', handler: handleFilter });
  eventListeners.push({ element: filterCheckbox, event: 'change', handler: handleFilter });

  // Person Card Click
  attachPersonCardListeners();

  // Form Submit
  const form = document.getElementById('personForm');
  if (form) {
    const handleSubmit = async (e) => {
      e.preventDefault();
      
      const name = document.getElementById('formName').value.trim();
      const birthday = document.getElementById('formBirthday').value;
      const info = document.getElementById('formInfo').value.trim();

      if (!name) {
        alert('Name ist erforderlich!');
        return;
      }

      try {
        const userCheck = await waitForUserOnce();
        if (!userCheck) {
          alert('Bitte einloggen, um Personen zu speichern.');
          window.location.href = './login.html';
          return;
        }
        const btn = form.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Speichern...';

        if (mode === 'edit' && editingId) {
          await updatePerson(editingId, { name, birthday, info });
        } else if (mode === 'create') {
          await createPerson({ name, birthday, info });
        }

        // Reload list
        allPersons = await listPersons();
        filteredPersons = [...allPersons];
        mode = 'none';
        editingId = null;

        renderPersonsList();
        renderForm();
        bindFormEvents();

        attachPersonCardListeners();

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
        mode = 'none';
        editingId = null;
        renderForm();
        renderPersonsList();
      };
      cancelBtn.addEventListener('click', handleCancel);
      eventListeners.push({ element: cancelBtn, event: 'click', handler: handleCancel });
    }

    // Delete Button
    const deleteBtn = document.getElementById('deleteBtn');
    if (deleteBtn) {
      const handleDelete = async () => {
        if (!confirm(`Möchtest du "${document.getElementById('formName').value}" wirklich löschen?`)) return;

        try {
          const userCheck = await waitForUserOnce();
          if (!userCheck) {
            alert('Bitte einloggen, um Personen zu löschen.');
            window.location.href = './login.html';
            return;
          }
          deleteBtn.disabled = true;
          deleteBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Löschen...';

          await deletePerson(editingId);

          // Reload list
          allPersons = await listPersons();
          filteredPersons = [...allPersons];
          mode = 'none';
          editingId = null;

          renderPersonsList();
          renderForm();
          attachPersonCardListeners();

          deleteBtn.disabled = false;
          deleteBtn.innerHTML = '<i class="bi bi-trash"></i> Löschen';
        } catch (err) {
          console.error('Fehler beim Löschen:', err);
          alert(`Fehler: ${err.message}`);
          deleteBtn.disabled = false;
          deleteBtn.innerHTML = '<i class="bi bi-trash"></i> Löschen';
        }
      };
      deleteBtn.addEventListener('click', handleDelete);
      eventListeners.push({ element: deleteBtn, event: 'click', handler: handleDelete });
    }
  }
}

function attachPersonCardListeners() {
  document.querySelectorAll('.person-card')?.forEach(card => {
    const handler = () => {
        const personId = card.dataset.personId;
        mode = 'edit';
        editingId = personId;
      renderForm();
      bindFormEvents();
      renderPersonsList();
      attachPersonCardListeners();
      // On mobile, switch to form tab
      if (window.innerWidth < 992) {
        document.querySelectorAll('.persons-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('[data-tab="edit"]')?.classList.add('active');
        document.getElementById('listContainer').classList.add('mobile-hidden');
        document.getElementById('formContainer').classList.remove('mobile-hidden');
      }
    };
    card.addEventListener('click', handler);
    eventListeners.push({ element: card, event: 'click', handler });
  });
}

export function destroy() {
  eventListeners.forEach(({ element, event, handler }) => {
    if (element) element.removeEventListener(event, handler);
  });
  eventListeners = [];
  allPersons = [];
  filteredPersons = [];
  editingId = null;
  mode = 'none';
}
