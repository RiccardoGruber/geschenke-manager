/**
 * persons-section.js
 * -------------------------------------------------------
 * Personen-Verwaltung mit zweispaltiger/Tab-basierter UI
 * Desktop: Links Liste, rechts Formular
 * Mobile:  Tabs (Liste / Bearbeiten)
 */

import { listPersons, createPerson, updatePerson, deletePerson } from '../person-service.js';
import { waitForUserOnce, isAuthed } from '../auth-adapter.js';
import { hasGiftIdeasByPerson } from '../gift-idea-service.js';
import { hasGiftsByPerson }     from '../gift-service.js';

// ---------- State ----------

let allPersons      = [];
let filteredPersons = [];
let editingId       = null;
let mode            = 'none'; // 'none' | 'create' | 'edit'
let eventListeners  = [];
let messageTimer    = null;
let activeDeleteModalCleanup = null;

// ---------- Helpers ----------

function showPersonsMessage(msg, type = 'success') {
  const box = document.getElementById('personsMessage');
  if (!box) return;
  box.innerHTML = `<div class="alert alert-${type}" role="alert">${msg}</div>`;
  if (messageTimer) clearTimeout(messageTimer);
  messageTimer = setTimeout(() => { box.innerHTML = ''; messageTimer = null; }, 3000);
}

function addListener(element, event, handler) {
  if (!element) return;
  element.addEventListener(event, handler);
  eventListeners.push({ element, event, handler });
}

function removeAllListeners() {
  eventListeners.forEach(({ element, event, handler }) => {
    if (element) element.removeEventListener(event, handler);
  });
  eventListeners = [];
}

function showDeleteConfirmModal(personName = '') {
  if (activeDeleteModalCleanup) activeDeleteModalCleanup(false);

  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'occasion-delete-modal-backdrop';
    backdrop.innerHTML = `
      <div class="occasion-delete-modal" role="dialog" aria-modal="true" aria-labelledby="personDeleteModalTitle" tabindex="-1">
        <div class="occasion-delete-modal-header">
          <h5 id="personDeleteModalTitle" class="mb-0">
            <i class="bi bi-exclamation-triangle text-danger"></i> Person löschen
          </h5>
          <button type="button" class="btn-close" aria-label="Schliessen"></button>
        </div>
        <div class="occasion-delete-modal-body">
          <p class="mb-2">Moechtest du diese Person wirklich löschen?</p>
          <p class="mb-0 text-muted small occasion-delete-modal-name"></p>
        </div>
        <div class="occasion-delete-modal-actions">
          <button type="button" class="btn btn-outline-secondary" data-action="cancel">Abbrechen</button>
          <button type="button" class="btn btn-danger" data-action="confirm">
            <i class="bi bi-trash"></i> Löschen
          </button>
        </div>
      </div>
    `;

    const modalEl = backdrop.querySelector('.occasion-delete-modal');
    const closeBtn = backdrop.querySelector('.btn-close');
    const cancelBtn = backdrop.querySelector('[data-action="cancel"]');
    const confirmBtn = backdrop.querySelector('[data-action="confirm"]');
    const nameEl = backdrop.querySelector('.occasion-delete-modal-name');

    if (personName) nameEl.textContent = `Person: "${personName}"`;
    else nameEl.remove();

    const finish = (result) => {
      document.removeEventListener('keydown', onKeydown);
      backdrop.removeEventListener('click', onBackdropClick);
      closeBtn.removeEventListener('click', onCancel);
      cancelBtn.removeEventListener('click', onCancel);
      confirmBtn.removeEventListener('click', onConfirm);
      backdrop.remove();
      document.body.classList.remove('occasion-delete-modal-open');
      if (activeDeleteModalCleanup === finish) activeDeleteModalCleanup = null;
      resolve(result);
    };

    const onCancel = () => finish(false);
    const onConfirm = () => finish(true);
    const onBackdropClick = (e) => {
      if (e.target === backdrop) onCancel();
    };
    const onKeydown = (e) => {
      if (e.key === 'Escape') onCancel();
    };

    activeDeleteModalCleanup = finish;
    document.body.classList.add('occasion-delete-modal-open');
    document.body.appendChild(backdrop);
    document.addEventListener('keydown', onKeydown);
    backdrop.addEventListener('click', onBackdropClick);
    closeBtn.addEventListener('click', onCancel);
    cancelBtn.addEventListener('click', onCancel);
    confirmBtn.addEventListener('click', onConfirm);

    modalEl.focus?.();
    confirmBtn.focus();
  });
}

function getDeleteFailedMessage(err) {
  const raw = String(err?.message || err || '').toLowerCase();
  if (raw.includes('permission') || raw.includes('unauthorized')) {
    return 'Die Person kann nicht geloescht werden. Es fehlen Berechtigungen.';
  }
  if (raw.includes('kein eingeloggter benutzer') || raw.includes('auth')) {
    return 'Die Person kann nicht geloescht werden. Bitte erneut einloggen.';
  }
  if (raw.includes('id fehlt')) {
    return 'Die Person kann nicht geloescht werden. Die ID fehlt.';
  }
  return `Die Person kann nicht geloescht werden: ${err?.message || err}`;
}

/** Wechselt den sichtbaren Tab (nur Mobile < 992px). */
function switchToTab(tabName) {
  if (window.innerWidth >= 992) return;
  document.querySelectorAll('.persons-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`[data-tab="${tabName}"]`)?.classList.add('active');
  document.getElementById('listContainer')?.classList.toggle('mobile-hidden', tabName !== 'list');
  document.getElementById('formContainer')?.classList.toggle('mobile-hidden', tabName !== 'edit');
}

// ---------- Rendering ----------

export async function render(container, ctx) {
  ctx.setPageHeader('Personen verwalten', 'Verwalte hier alle wichtigen Personen. Du kannst neue Personen hinzufügen, bearbeiten oder löschen.');

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

  try {
    allPersons = await listPersons();
  } catch (err) {
    console.warn('Fehler beim Laden von Personen:', err);
    container.innerHTML = `
      <div class="alert alert-warning">
        Personen konnten nicht geladen werden. Bitte einloggen oder später erneut versuchen.
        <div class="mt-2"><a class="btn btn-sm btn-primary" href="./login.html">Zum Login</a></div>
      </div>
    `;
    return;
  }

  filteredPersons = [...allPersons];
  mode            = 'none';
  editingId       = null;

  container.innerHTML = `
    <div class="persons-manager">
      <div id="personsMessage" class="mb-3"></div>

      <!-- Tab Navigation (nur Mobile) -->
      <div class="persons-tabs d-lg-none mb-3">
        <button class="persons-tab-btn active" data-tab="list">
          <i class="bi bi-list-ul"></i> Liste
        </button>
        <button class="persons-tab-btn" data-tab="edit">
          <i class="bi bi-pencil-square"></i> Bearbeiten
        </button>
      </div>

      <div class="persons-content">
        <!-- Linke Spalte: Personenliste -->
        <div class="persons-list-container" id="listContainer">
          <div class="persons-list-header">
            <h5 class="mb-0">
              <i class="bi bi-people-fill"></i> Personen
              <span class="badge bg-light text-dark" id="personsCount">${filteredPersons.length}</span>
            </h5>
            <button class="btn btn-sm btn-primary" id="addPersonBtn">
              <i class="bi bi-plus-circle"></i> Neu
            </button>
          </div>

          <div class="persons-search mb-3">
            <input
              type="text"
              class="form-control form-control-sm"
              id="searchInput"
              placeholder="Personen suchen..."
            >
          </div>

          <div class="persons-list" id="personsList"></div>
        </div>

        <!-- Rechte Spalte: Formular (Desktop: immer sichtbar wenn Mode != none) -->
        <div class="persons-form-container d-lg-block" id="formContainer">
          <div class="persons-form-content" id="formContent"></div>
        </div>
      </div>
    </div>
  `;

  renderPersonsList();
  renderForm();
  attachEventListeners(ctx);
}

function renderPersonsList() {
  const listDiv = document.getElementById('personsList');
  if (!listDiv) return;

  // Zähler aktualisieren
  const counter = document.getElementById('personsCount');
  if (counter) counter.textContent = filteredPersons.length;

  if (!filteredPersons.length) {
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
    const hasBirthday = person.birthday?.trim() !== '';
    const isActive    = editingId === person.id;

    return `
      <div class="person-card ${isActive ? 'active' : ''}" data-person-id="${person.id}">
        <div class="person-card-header">
          <div class="person-avatar">${person.name.charAt(0).toUpperCase()}</div>
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
  if (!formDiv) return;

  if (mode === 'none') {
    formDiv.innerHTML = `
      <div class="persons-form-placeholder">
        <i class="bi bi-person-plus"></i>
        <h6>Person auswählen oder neu anlegen</h6>
        <p class="text-muted small">
          Wähle eine Person aus der Liste, um sie zu bearbeiten,<br>
          oder klick "Neu" um eine neue Person hinzuzufügen.
        </p>
      </div>
    `;
    return;
  }

  const isEdit = mode === 'edit';
  const person = isEdit ? allPersons.find(p => p.id === editingId) : null;

  formDiv.innerHTML = `
    <form class="persons-form" id="personForm">
      <h5>
        <i class="bi bi-${isEdit ? 'pencil-square' : 'person-plus'}"></i>
        ${isEdit ? 'Bearbeiten' : 'Neu'}
      </h5>

      <div class="mb-3">
        <label for="formName" class="form-label">Name <span class="text-danger">*</span></label>
        <input type="text" class="form-control" id="formName"
               value="${person?.name || ''}" placeholder="z.B. Anna Müller" required>
        <small class="text-muted">Pflichtfeld</small>
      </div>

      <div class="mb-3">
        <label for="formBirthday" class="form-label"><i class="bi bi-calendar"></i> Geburtstag</label>
        <input type="date" class="form-control" id="formBirthday" value="${person?.birthday || ''}">
        <small class="text-muted">Optional</small>
      </div>

      <div class="mb-3">
        <label for="formInfo" class="form-label">Info / Notizen</label>
        <textarea class="form-control" id="formInfo" rows="3"
                  placeholder="z.B. Schwester, Kollege...">${person?.info || ''}</textarea>
        <small class="text-muted">Optional</small>
      </div>

      <div class="persons-form-actions">
        <button type="submit" class="btn btn-primary">
          <i class="bi bi-check-circle"></i> Speichern
        </button>
        <button type="button" class="btn btn-outline-secondary" id="cancelBtn">
          <i class="bi bi-x-circle"></i> Abbrechen
        </button>
        ${isEdit ? `
          <button type="button" class="btn btn-outline-danger" id="deleteBtn">
            <i class="bi bi-trash"></i> Löschen
          </button>
        ` : ''}
      </div>
    </form>
  `;
}

// ---------- Event Handlers ----------

/**
 * Bindet alle Event-Listener neu.
 * Wird nach jedem vollständigen Re-Render aufgerufen.
 * Setzt eventListeners zurück, um Listener-Akkumulation zu verhindern.
 */
function attachEventListeners(ctx) {
  removeAllListeners();

  // "Neu"-Button
  const addBtn = document.getElementById('addPersonBtn');
  addListener(addBtn, 'click', () => {
    mode      = 'create';
    editingId = null;
    renderForm();
    bindFormEvents(ctx);
    renderPersonsList();
    switchToTab('edit');
  });

  // Tab-Navigation (Mobile)
  document.querySelectorAll('.persons-tab-btn').forEach(tab => {
    addListener(tab, 'click', (e) => {
      const tabName = e.target.closest('.persons-tab-btn')?.dataset.tab;
      if (tabName) switchToTab(tabName);
    });
  });

  // Suche
  const searchInput = document.getElementById('searchInput');
  addListener(searchInput, 'input', (e) => {
    const term = e.target.value.toLowerCase();
    filteredPersons = allPersons.filter(p =>
      p.name.toLowerCase().includes(term) ||
      (p.info && p.info.toLowerCase().includes(term))
    );
    renderPersonsList();
    attachPersonCardListeners(ctx);
  });

  attachPersonCardListeners(ctx);
  bindFormEvents(ctx);
}

/**
 * Bindet Klick-Handler auf Personen-Karten.
 * Wird nach jedem renderPersonsList() erneut aufgerufen.
 */
function attachPersonCardListeners(ctx) {
  document.querySelectorAll('.person-card').forEach(card => {
    addListener(card, 'click', () => {
      editingId = card.dataset.personId;
      mode      = 'edit';
      renderForm();
      bindFormEvents(ctx);
      renderPersonsList();
      attachPersonCardListeners(ctx);
      switchToTab('edit');
    });
  });
}

/**
 * Bindet Submit/Cancel/Delete-Handler auf das aktuell gerenderte Formular.
 * Muss nach jedem renderForm() aufgerufen werden.
 */
function bindFormEvents(ctx) {
  const form = document.getElementById('personForm');
  if (!form) return;

  addListener(form, 'submit', async (e) => {
    e.preventDefault();

    const name     = document.getElementById('formName').value.trim();
    const birthday = document.getElementById('formBirthday').value;
    const info     = document.getElementById('formInfo').value.trim();

    if (!name) {
      showPersonsMessage('Name ist erforderlich!', 'warning');
      return;
    }

    const userCheck = await waitForUserOnce();
    if (!userCheck) {
      alert('Bitte einloggen, um Personen zu speichern.');
      window.location.href = './login.html';
      return;
    }

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Speichern...';

    try {
      if (mode === 'edit' && editingId) {
        await updatePerson(editingId, { name, birthday, info });
      } else if (mode === 'create') {
        await createPerson({ name, birthday, info });
      }

      allPersons      = await listPersons();
      filteredPersons = [...allPersons];
      mode            = 'none';
      editingId       = null;

      renderPersonsList();
      renderForm();
      attachEventListeners(ctx);
    } catch (err) {
      console.error('Fehler beim Speichern:', err);
      showPersonsMessage(`Fehler: ${err.message || err}`, 'danger');
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-check-circle"></i> Speichern';
    }
  });

  const cancelBtn = document.getElementById('cancelBtn');
  addListener(cancelBtn, 'click', () => {
    mode      = 'none';
    editingId = null;
    renderForm();
    renderPersonsList();
    attachEventListeners(ctx);
    switchToTab('list');
  });

  const deleteBtn = document.getElementById('deleteBtn');
  addListener(deleteBtn, 'click', async () => {
    const personName = document.getElementById('formName').value;
    const shouldDelete = await showDeleteConfirmModal(personName);
    if (!shouldDelete) return;

    const userCheck = await waitForUserOnce();
    if (!userCheck) {
      showPersonsMessage('Bitte einloggen, um Personen zu löschen.', 'warning');
      window.location.href = './login.html';
      return;
    }

    deleteBtn.disabled = true;
    deleteBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Löschen...';

    try {
      const [hasIdeas, hasGifts] = await Promise.all([
        hasGiftIdeasByPerson(editingId),
        hasGiftsByPerson(editingId)
      ]);

      if (hasIdeas || hasGifts) {
        showPersonsMessage('Diese Person kann nicht gelöscht werden, weil bereits Geschenkideen oder Geschenke existieren.', 'warning');
        deleteBtn.disabled = false;
        deleteBtn.innerHTML = '<i class="bi bi-trash"></i> Löschen';
        return;
      }

      await deletePerson(editingId);
      showPersonsMessage('Person wurde erfolgreich gelöscht.', 'success');

      allPersons      = await listPersons();
      filteredPersons = [...allPersons];
      mode            = 'none';
      editingId       = null;

      renderPersonsList();
      renderForm();
      attachEventListeners(ctx);
      switchToTab('list');
    } catch (err) {
      console.error('Fehler beim Löschen:', err);
      showPersonsMessage(getDeleteFailedMessage(err), 'danger');
      deleteBtn.disabled = false;
      deleteBtn.innerHTML = '<i class="bi bi-trash"></i> Löschen';
    }
  });
}

// ---------- Lifecycle ----------

export function destroy() {
  if (activeDeleteModalCleanup) activeDeleteModalCleanup(false);
  removeAllListeners();
  if (messageTimer) {
    clearTimeout(messageTimer);
    messageTimer = null;
  }
  allPersons      = [];
  filteredPersons = [];
  editingId       = null;
  mode            = 'none';
}
