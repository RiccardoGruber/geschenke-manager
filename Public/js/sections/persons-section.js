/**
 * persons-section.js
 * -------------------------------------------------------
 * Personen-Verwaltung als Kachel-Grid mit Accordion-Verhalten.
 */

import { listPersons, createPerson, updatePerson, deletePerson } from '../person-service.js';
import { listGiftIdeas } from '../gift-idea-service.js';
import { listGifts, listPastGifts, deletePastGift } from '../gift-service.js';
import { waitForUserOnce, isAuthed } from '../auth-adapter.js';

// ---------- State ----------

let allPersons = [];
let filteredPersons = [];
let allGiftIdeas = [];
let allGifts = [];
let allPastGifts = [];

let mode = 'none'; // 'none' | 'create' | 'edit'
let editingId = null;
let currentlyOpenPersonId = null;

let eventListeners = [];
let messageTimer = null;
let activeDeleteModalCleanup = null;
let currentCtx = null;

// ---------- Helpers ----------

function addListener(element, event, handler) {
  if (!element) return;
  element.addEventListener(event, handler);
  eventListeners.push({ element, event, handler });
}

function removeAllListeners() {
  eventListeners.forEach(({ element, event, handler }) => element?.removeEventListener(event, handler));
  eventListeners = [];
}

function showPersonsMessage(msg, type = 'success') {
  const box = document.getElementById('personsMessage');
  if (!box) return;
  box.innerHTML = `<div class="alert alert-${type}" role="alert">${msg}</div>`;
  if (messageTimer) clearTimeout(messageTimer);
  messageTimer = setTimeout(() => {
    box.innerHTML = '';
    messageTimer = null;
  }, 3000);
}

function normalizeStatus(status) {
  return String(status || '').trim().toLowerCase();
}

function parseDateOnly(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setHours(0, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDisplayDate(value) {
  const d = parseDateOnly(value);
  if (!d) return '-';
  return d.toLocaleDateString('de-DE', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatStatus(status) {
  const s = normalizeStatus(status);
  if (s === 'ueberreicht') return 'Ueberreicht';
  if (s === 'erledigt') return 'Erledigt';
  if (s === 'besorgt') return 'Besorgt';
  return 'Offen';
}

function getPersonById(personId) {
  return allPersons.find((p) => p.id === personId) || null;
}

function getPersonDetailData(personId) {
  const gifts = allGifts.filter((g) => g.personId === personId);
  const ideas = allGiftIdeas.filter((i) => i.personId === personId);
  const past = allPastGifts.filter((g) => g.personId === personId);
  return { gifts, ideas, past };
}

export function calculatePersonPreviewStats(person) {
  const personId = person?.id;
  if (!personId) {
    return { ideasTotal: 0, ideasOpen: 0, giftsTotal: 0, giftsOpen: 0 };
  }

  const ideas = allGiftIdeas.filter((idea) => idea.personId === personId);
  const gifts = allGifts.filter((gift) => gift.personId === personId);
  const ideasTotal = ideas.length;
  const ideasOpen = ideas.filter((idea) => normalizeStatus(idea.status) === 'offen').length;
  const giftsTotal = gifts.length;
  const giftsOpen = gifts.filter((gift) => normalizeStatus(gift.status) === 'offen').length;

  return {
    ideasTotal,
    ideasOpen,
    giftsTotal,
    giftsOpen
  };
}

export function renderPersonPreviewStats(person) {
  const stats = calculatePersonPreviewStats(person);
  const openCountsBadgeStyle = 'background-color: #ffe7b3; color: #7a5a00;';

  return `
    <div class="mt-3">
      <div class="row g-2">
        <div class="col-6">
          <span class="badge bg-light text-dark w-100 text-start py-2">${stats.ideasTotal} Ideen</span>
        </div>
        <div class="col-6">
          <span class="badge w-100 text-start py-2" style="${openCountsBadgeStyle}">${stats.ideasOpen} Ideen offen</span>
        </div>
        <div class="col-6">
          <span class="badge bg-light text-dark w-100 text-start py-2">${stats.giftsTotal} Geschenke</span>
        </div>
        <div class="col-6">
          <span class="badge w-100 text-start py-2" style="${openCountsBadgeStyle}">${stats.giftsOpen} Geschenke offen</span>
        </div>
      </div>
    </div>
  `;
}

export function closeAllPersonCards() {
  currentlyOpenPersonId = null;
  renderPersonsList();
}

export function openPersonCard(personId) {
  currentlyOpenPersonId = personId || null;
  renderPersonsList();
}

export function togglePersonCard(personId) {
  if (!personId) return;
  if (currentlyOpenPersonId === personId) {
    closeAllPersonCards();
    return;
  }
  openPersonCard(personId);
}

async function loadAllData() {
  const [persons, ideas, gifts, past] = await Promise.all([
    listPersons().catch(() => []),
    listGiftIdeas().catch(() => []),
    listGifts().catch(() => []),
    listPastGifts().catch(() => [])
  ]);

  allPersons = persons || [];
  allGiftIdeas = ideas || [];
  allGifts = gifts || [];
  allPastGifts = past || [];
  filteredPersons = [...allPersons];
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
          <p class="mb-2">Möchtest du diese Person wirklich löschen?</p>
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

function showDeletePastCascadeModal(personName = '', pastCount = 0) {
  if (activeDeleteModalCleanup) activeDeleteModalCleanup(false);

  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'occasion-delete-modal-backdrop';
    backdrop.innerHTML = `
      <div class="occasion-delete-modal" role="dialog" aria-modal="true" aria-labelledby="personDeletePastModalTitle" tabindex="-1">
        <div class="occasion-delete-modal-header">
          <h5 id="personDeletePastModalTitle" class="mb-0">
            <i class="bi bi-exclamation-octagon text-danger"></i> Person inkl. Historie löschen
          </h5>
          <button type="button" class="btn-close" aria-label="Schliessen"></button>
        </div>
        <div class="occasion-delete-modal-body">
          <p class="mb-2">Diese Person hat <strong>${pastCount}</strong> vergangene Geschenke.</p>
          <p class="mb-2">Sollen die Person und alle vergangenen Geschenke endgültig gelöscht werden?</p>
          <p class="mb-0 text-muted small occasion-delete-modal-name"></p>
        </div>
        <div class="occasion-delete-modal-actions">
          <button type="button" class="btn btn-outline-secondary" data-action="cancel">Abbrechen</button>
          <button type="button" class="btn btn-danger" data-action="confirm">
            <i class="bi bi-trash"></i> Alles löschen
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

function renderPersonDetails(personId) {
  const { gifts, ideas, past } = getPersonDetailData(personId);

  const renderList = (items, type) => {
    if (!items.length) return `<p class="text-muted small mb-0">Keine Einträge vorhanden.</p>`;
    return items.map((item) => {
      const title = type === 'ideas'
        ? (item.giftName || item.content || 'Geschenkidee')
        : (item.giftName || item.occasionName || (type === 'past' ? 'Vergangenes Geschenk' : 'Geschenk'));

      const meta = type === 'ideas'
        ? `${item.occasionName || '-'} · ${formatStatus(item.status)}`
        : `${formatDisplayDate(item.date)} · ${formatStatus(item.status)}`;

      const cardClass = type === 'ideas' ? 'gift-idea-card' : 'gift-card';
      const iconClass = type === 'ideas' ? 'text-warning' : (type === 'past' ? 'text-success' : 'text-primary');

      return `
        <div class="card ${cardClass} mb-2" data-nav-gift="${type}" data-gift-id="${item.id}" style="cursor:pointer;">
          <div class="card-body py-2">
            <div class="d-flex justify-content-between align-items-center">
              <div>
                <div class="fw-semibold">${title}</div>
                <small class="text-muted">${meta}</small>
              </div>
              <i class="bi bi-arrow-right-circle ${iconClass}"></i>
            </div>
          </div>
        </div>
      `;
    }).join('');
  };

  return `
    <div class="mt-3 pt-3 border-top">
      <div class="d-flex gap-2 mb-3">
        <button class="btn btn-sm btn-outline-primary" data-action="edit-person" data-person-id="${personId}">
          <i class="bi bi-pencil"></i> Bearbeiten
        </button>
        <button class="btn btn-sm btn-outline-secondary" data-action="collapse-person" data-person-id="${personId}">
          <i class="bi bi-chevron-up"></i> Einklappen
        </button>
      </div>

      <div class="mb-3">
        <h6 class="mb-2"><i class="bi bi-gift"></i> Geschenke</h6>
        ${renderList(gifts, 'gifts')}
      </div>
      <div class="mb-3">
        <h6 class="mb-2"><i class="bi bi-lightbulb"></i> Geschenkideen</h6>
        ${renderList(ideas, 'ideas')}
      </div>
      <div>
        <h6 class="mb-2"><i class="bi bi-clock-history"></i> Vergangene Geschenke</h6>
        ${renderList(past, 'past')}
      </div>
    </div>
  `;
}

function renderPersonsList() {
  const listDiv = document.getElementById('personsList');
  if (!listDiv) return;

  const counter = document.getElementById('personsCount');
  if (counter) counter.textContent = filteredPersons.length;

  if (!filteredPersons.length) {
    listDiv.innerHTML = `
      <div class="text-center py-5 text-muted">
        <i class="bi bi-inbox" style="font-size: 3rem;"></i>
        <h5 class="mt-3">Keine Personen</h5>
        <p>Klicke auf "Neu", um eine Person hinzuzuügen.</p>
      </div>
    `;
    return;
  }

  listDiv.innerHTML = `
    <div class="row g-3">
      ${filteredPersons.map((person) => {
        const isOpen = currentlyOpenPersonId === person.id;
        return `
          <div class="col-12 col-md-6 col-lg-4">
            <div class="card h-100 gift-card person-card ${isOpen ? 'active' : ''}" data-person-card="${person.id}" style="cursor:pointer;">
              <div class="card-body d-flex flex-column">
                <h2 class="gift-primary-title mb-2">
                  <i class="bi bi-person-circle text-primary"></i>
                  ${person.name}
                </h2>
                <div class="gift-meta-list">
                  <div class="gift-meta-item">
                    <i class="bi bi-calendar-event text-muted"></i>
                    <span class="fw-semibold">Geburtstag:</span>
                    <span>${formatDisplayDate(person.birthday)}</span>
                  </div>
                  <div class="gift-meta-item">
                    <i class="bi bi-chat-left-text text-muted"></i>
                    <span class="fw-semibold">Info:</span>
                    <span class="text-muted text-truncate d-inline-block" style="max-width: 200px;">${person.info || '-'}</span>
                  </div>
                </div>
                <div class="mt-auto">
                  ${renderPersonPreviewStats(person)}
                  <div class="d-flex justify-content-end mt-3">
                    <span class="badge bg-light text-dark">
                      <i class="bi bi-chevron-${isOpen ? 'up' : 'down'}"></i> ${isOpen ? 'Weniger' : 'Details'}
                    </span>
                  </div>
                </div>
                ${isOpen ? renderPersonDetails(person.id) : ''}
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderEditor() {
  const host = document.getElementById('personEditor');
  if (!host) return;

  if (mode === 'none') {
    host.innerHTML = '';
    return;
  }

  const isEdit = mode === 'edit';
  const person = isEdit ? getPersonById(editingId) : null;

  host.innerHTML = `
    <form class="persons-form card p-3 mb-3" id="personForm">
      <h5 class="mb-3">
        <i class="bi bi-${isEdit ? 'pencil-square' : 'person-plus'}"></i>
        ${isEdit ? 'Person bearbeiten' : 'Neue Person'}
      </h5>

      <div class="mb-3">
        <label for="formName" class="form-label">Name <span class="text-danger">*</span></label>
        <input type="text" class="form-control" id="formName"
               value="${person?.name || ''}" placeholder="z.B. Anna Müller" required>
      </div>

      <div class="mb-3">
        <label for="formBirthday" class="form-label">Geburtstag</label>
        <input type="date" class="form-control" id="formBirthday" value="${person?.birthday || ''}">
      </div>

      <div class="mb-3">
        <label for="formInfo" class="form-label">Info / Notizen</label>
        <textarea class="form-control" id="formInfo" rows="3"
                  placeholder="z.B. Schwester, Kollege...">${person?.info || ''}</textarea>
      </div>

      <div class="d-flex gap-2">
        <button type="submit" class="btn btn-primary">
          <i class="bi bi-check-circle"></i> Speichern
        </button>
        <button type="button" class="btn btn-outline-secondary" id="cancelBtn">
          <i class="bi bi-x-circle"></i> Abbrechen
        </button>
        ${isEdit ? `
          <button type="button" class="btn btn-outline-danger ms-auto" id="deleteBtn">
            <i class="bi bi-trash"></i> Löschen
          </button>
        ` : ''}
      </div>
    </form>
  `;
}

async function savePersonFromForm() {
  const name = document.getElementById('formName')?.value.trim();
  const birthday = document.getElementById('formBirthday')?.value || '';
  const info = document.getElementById('formInfo')?.value.trim() || '';

  if (!name) {
    showPersonsMessage('Name ist erforderlich.', 'warning');
    return;
  }

  const userCheck = await waitForUserOnce();
  if (!userCheck) {
    window.location.href = './login.html';
    return;
  }

  if (mode === 'edit' && editingId) {
    await updatePerson(editingId, { name, birthday, info });
  } else {
    await createPerson({ name, birthday, info });
  }

  await loadAllData();
  mode = 'none';
  editingId = null;
  if (currentlyOpenPersonId && !getPersonById(currentlyOpenPersonId)) {
    currentlyOpenPersonId = null;
  }
  renderEditor();
  renderPersonsList();
}

function getDeleteDependencies(personId) {
  const ideas = allGiftIdeas.filter((idea) => idea.personId === personId);
  const plannedGifts = allGifts.filter((gift) => gift.personId === personId);
  const pastGifts = allPastGifts.filter((gift) => gift.personId === personId);

  return {
    ideas,
    plannedGifts,
    pastGifts
  };
}

async function deletePastGiftsForPerson(personId) {
  const { pastGifts } = getDeleteDependencies(personId);
  for (const gift of pastGifts) {
    if (!gift?.id) continue;
    await deletePastGift(gift.id);
  }
  return pastGifts.length;
}

function getDeleteFailedMessage(err) {
  const raw = String(err?.message || err || '').toLowerCase();
  if (raw.includes('permission') || raw.includes('unauthorized')) return 'Die Person kann nicht gelöscht werden. Es fehlen Berechtigungen.';
  if (raw.includes('kein eingeloggter benutzer') || raw.includes('auth')) return 'Die Person kann nicht gelöscht werden. Bitte erneut einloggen.';
  if (raw.includes('id fehlt')) return 'Die Person kann nicht gelöscht werden. Die ID fehlt.';
  return `Die Person kann nicht gelöscht werden: ${err?.message || err}`;
}

function attachEventListeners(ctx) {
  currentCtx = ctx;
  removeAllListeners();

  const addBtn = document.getElementById('addPersonBtn');
  const searchInput = document.getElementById('searchInput');
  const listHost = document.getElementById('personsList');
  const editorHost = document.getElementById('personEditor');

  addListener(addBtn, 'click', () => {
    mode = 'create';
    editingId = null;
    renderEditor();
  });

  addListener(searchInput, 'input', (e) => {
    const term = String(e.target.value || '').toLowerCase();
    filteredPersons = allPersons.filter((p) =>
      String(p.name || '').toLowerCase().includes(term) ||
      String(p.info || '').toLowerCase().includes(term)
    );
    if (currentlyOpenPersonId && !filteredPersons.some((p) => p.id === currentlyOpenPersonId)) {
      currentlyOpenPersonId = null;
    }
    renderPersonsList();
  });

  addListener(listHost, 'click', (e) => {
    const navCard = e.target.closest('[data-nav-gift]');
    if (navCard) {
      e.preventDefault();
      e.stopPropagation();
      const tab = navCard.getAttribute('data-nav-gift');
      const id = navCard.getAttribute('data-gift-id');
      if (tab && id) ctx.navigate('gifts', { tab, id, personId: currentlyOpenPersonId });
      return;
    }

    const actionBtn = e.target.closest('[data-action]');
    if (actionBtn) {
      e.preventDefault();
      e.stopPropagation();
      const action = actionBtn.getAttribute('data-action');
      const personId = actionBtn.getAttribute('data-person-id');
      if (action === 'collapse-person') closeAllPersonCards();
      if (action === 'edit-person') {
        editingId = personId;
        mode = 'edit';
        renderEditor();
      }
      return;
    }

    const card = e.target.closest('[data-person-card]');
    if (!card) return;
    const personId = card.getAttribute('data-person-card');
    togglePersonCard(personId);
  });

  addListener(editorHost, 'submit', async (e) => {
    if (e.target?.id !== 'personForm') return;
    e.preventDefault();
    try {
      await savePersonFromForm();
    } catch (err) {
      showPersonsMessage(`Fehler: ${err?.message || err}`, 'danger');
    }
  });

  addListener(editorHost, 'click', async (e) => {
    const cancelBtn = e.target.closest('#cancelBtn');
    if (cancelBtn) {
      e.preventDefault();
      mode = 'none';
      editingId = null;
      renderEditor();
      return;
    }

    const deleteBtn = e.target.closest('#deleteBtn');
    if (!deleteBtn) return;
    e.preventDefault();

    if (!editingId) return;
    const personIdToDelete = editingId;
    const person = getPersonById(personIdToDelete);
    const ok = await showDeleteConfirmModal(person?.name || '');
    if (!ok) return;

    try {
      const dependencies = getDeleteDependencies(personIdToDelete);
      const ideasCount = dependencies.ideas.length;
      const plannedCount = dependencies.plannedGifts.length;
      const pastCount = dependencies.pastGifts.length;
      if (ideasCount || plannedCount) {
        showPersonsMessage(`Diese Person kann nicht gelöscht werden. Es existieren noch ${ideasCount} Geschenkideen und ${plannedCount} geplante Geschenke.`, 'warning');
        return;
      }

      let deletedPastCount = 0;
      if (pastCount > 0) {
        const cascadeConfirmed = await showDeletePastCascadeModal(person?.name || '', pastCount);
        if (!cascadeConfirmed) return;
        deletedPastCount = await deletePastGiftsForPerson(personIdToDelete);
      }

      await deletePerson(personIdToDelete);
      await loadAllData();
      if (currentlyOpenPersonId === personIdToDelete) currentlyOpenPersonId = null;
      editingId = null;
      mode = 'none';
      renderEditor();
      renderPersonsList();
      if (deletedPastCount > 0) {
        showPersonsMessage(`Person und ${deletedPastCount} vergangene Geschenke wurden erfolgreich gel�scht.`, 'success');
      } else {
        showPersonsMessage('Person wurde erfolgreich gel�scht.', 'success');
      }
    } catch (err) {
      showPersonsMessage(getDeleteFailedMessage(err), 'danger');
    }
  });
}

// ---------- Public API ----------

export async function render(container, ctx) {
  ctx.setPageHeader('Personen verwalten', 'Verwalte hier alle wichtigen Personen.');

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
    await loadAllData();
  } catch (err) {
    console.warn('Fehler beim Laden von Personen:', err);
    container.innerHTML = `
      <div class="alert alert-warning">
        Personen konnten nicht geladen werden.
      </div>
    `;
    return;
  }

  mode = 'none';
  editingId = null;

  const targetPersonId = ctx?.params?.id;
  if (targetPersonId && allPersons.some((p) => p.id === targetPersonId)) {
    currentlyOpenPersonId = targetPersonId;
  } else {
    currentlyOpenPersonId = null;
  }

  container.innerHTML = `
    <div class="persons-manager">
      <div id="personsMessage" class="mb-3"></div>
      <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
        <h5 class="mb-0">
          <i class="bi bi-people-fill"></i> Personen
          <span class="badge bg-light text-dark" id="personsCount">${filteredPersons.length}</span>
        </h5>
        <div class="d-flex gap-2">
          <input type="text" class="form-control form-control-sm" id="searchInput" placeholder="Personen suchen..." style="min-width: 220px;">
          <button class="btn btn-sm btn-primary" id="addPersonBtn">
            <i class="bi bi-plus-circle"></i> Neu
          </button>
        </div>
      </div>

      <div id="personEditor"></div>
      <div id="personsList"></div>
    </div>
  `;

  renderEditor();
  renderPersonsList();
  attachEventListeners(ctx);
}

export function destroy() {
  if (activeDeleteModalCleanup) activeDeleteModalCleanup(false);
  removeAllListeners();
  if (messageTimer) {
    clearTimeout(messageTimer);
    messageTimer = null;
  }

  allPersons = [];
  filteredPersons = [];
  allGiftIdeas = [];
  allGifts = [];
  allPastGifts = [];
  mode = 'none';
  editingId = null;
  currentlyOpenPersonId = null;
  currentCtx = null;
}
