/**
 * gifts-section.js
 * -------------------------------------------------------
 * Geschenke & Geschenkideen Verwaltung
 * Tabs: "Geschenke" (geplant) | "Geschenkideen"
 */

import { listGifts, createGift, updateGift, deleteGift }               from '../gift-service.js';
import { listGiftIdeas, createGiftIdea, updateGiftIdea, deleteGiftIdea } from '../gift-idea-service.js';
import { convertIdeaToGift }                                            from '../gift-convert.js';
import { listPersons }                                                   from '../person-service.js';
import { listOccasions }                                                 from '../occasion-service.js';
import { waitForUserOnce, isAuthed }                                     from '../auth-adapter.js';

// ---------- State ----------

let gifts     = [];
let ideas     = [];
let persons   = [];
let occasions = [];

let currentTab    = 'ideas';
let filters       = { search: '', person: 'all', status: 'all', occasion: 'all' };
let eventListeners = [];
let editingItem   = null;
let formMode      = 'none';  // 'none' | 'create' | 'edit' | 'convert'
let convertIdeaId = null;
let activeDeleteModalCleanup = null;

// Feste Anlässe (immer verfügbar, unabhängig von DB-Daten)
const FIXED_OCCASIONS = [
  { id: 'geburtstag',  name: 'Geburtstag' },
  { id: 'weihnachten', name: 'Weihnachten' }
];

// ---------- Helpers ----------

function addListener(el, evt, fn) {
  if (!el) return;
  el.addEventListener(evt, fn);
  eventListeners.push({ el, evt, fn });
}

function removeAllListeners() {
  eventListeners.forEach(({ el, evt, fn }) => el.removeEventListener(evt, fn));
  eventListeners = [];
}

function showDeleteConfirmModal(itemLabel = '') {
  if (activeDeleteModalCleanup) activeDeleteModalCleanup(false);

  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'occasion-delete-modal-backdrop';
    backdrop.innerHTML = `
      <div class="occasion-delete-modal" role="dialog" aria-modal="true" aria-labelledby="giftDeleteModalTitle" tabindex="-1">
        <div class="occasion-delete-modal-header">
          <h5 id="giftDeleteModalTitle" class="mb-0">
            <i class="bi bi-exclamation-triangle text-danger"></i> Eintrag löschen
          </h5>
          <button type="button" class="btn-close" aria-label="Schliessen"></button>
        </div>
        <div class="occasion-delete-modal-body">
          <p class="mb-2">Moechtest du diesen Eintrag wirklich löschen?</p>
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

    if (itemLabel) nameEl.textContent = `Eintrag: "${itemLabel}"`;
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

function getDeleteFailedMessage(err, label = 'Der Eintrag') {
  const raw = String(err?.message || err || '').toLowerCase();
  if (raw.includes('permission') || raw.includes('unauthorized')) {
    return `${label} konnte nicht geloescht werden. Es fehlen Berechtigungen.`;
  }
  if (raw.includes('kein eingeloggter benutzer') || raw.includes('auth')) {
    return `${label} konnte nicht geloescht werden. Bitte erneut einloggen.`;
  }
  if (raw.includes('id fehlt')) {
    return `${label} konnte nicht geloescht werden. Die ID fehlt.`;
  }
  return `${label} konnte nicht geloescht werden: ${err?.message || err}`;
}

/**
 * Entfernt aus DB-Anlässen alle, die einem festen Anlass entsprechen oder doppelt vorkommen.
 */
function getDeduplicatedOccasions() {
  const fixedNames = FIXED_OCCASIONS.map(o => o.name.toLowerCase());
  const seen       = new Set();

  return occasions.filter(occ => {
    const nameLower = (occ.name || '').toLowerCase().trim();
    if (fixedNames.includes(nameLower)) return false;
    if (seen.has(nameLower)) return false;
    seen.add(nameLower);
    return true;
  });
}

function showLoading(show) {
  document.getElementById('giftsLoading')?.classList.toggle('d-none', !show);
}

async function loadData() {
  showLoading(true);
  try {
    const [g, i, p, o] = await Promise.all([
      listGifts().catch(() => []),
      listGiftIdeas().catch(() => []),
      listPersons().catch(() => []),
      listOccasions().catch(() => [])
    ]);
    gifts     = g || [];
    ideas     = i || [];
    persons   = p || [];
    occasions = o || [];
  } finally {
    showLoading(false);
  }
}

function applyFilters(src) {
  return src.filter(item => {
    if (filters.search) {
      const fields = [
        item.personName,
        item.occasionName || '',
        item.giftName     || '',
        currentTab === 'gifts' ? item.note : item.content
      ];
      if (!fields.join(' ').toLowerCase().includes(filters.search.toLowerCase())) return false;
    }
    if (filters.person   !== 'all' && item.personId   !== filters.person)   return false;
    if (filters.occasion !== 'all' && item.occasionId !== filters.occasion) return false;
    if (filters.status !== 'all' && item.status !== filters.status) return false;
    return true;
  });
}

function resolveOccasionName(occasionId) {
  if (!occasionId) return '';
  const fixed  = FIXED_OCCASIONS.find(o => o.id === occasionId);
  const custom = occasions.find(o => o.id === occasionId);
  return (fixed || custom)?.name || '';
}

// ---------- Rendering ----------

function renderFilters(container) {
  const statuses = currentTab === 'gifts'
    ? ['all', 'offen', 'besorgt', 'ueberreicht']
    : ['all', 'offen'];

  const customOccasions = getDeduplicatedOccasions();

  container.innerHTML = `
    <div class="d-flex gap-3 align-items-center flex-wrap mb-3">
      <div style="flex: 1; min-width: 250px;">
        <input type="text" id="giftsSearch" class="form-control"
               placeholder="Suche nach Name, Person, Anlass..."
               value="${filters.search || ''}">
      </div>

      <div>
        <select id="filterPerson" class="form-select">
          <option value="all" ${filters.person === 'all' ? 'selected' : ''}>Alle Personen</option>
          ${persons.map(p => `
            <option value="${p.id}" ${filters.person === p.id ? 'selected' : ''}>${p.name}</option>
          `).join('')}
        </select>
      </div>

      <div>
        <select id="filterOccasion" class="form-select">
          <option value="all" ${filters.occasion === 'all' ? 'selected' : ''}>Alle Anlässe</option>
          <optgroup label="Feste Anlässe">
            ${FIXED_OCCASIONS.map(o => `
              <option value="${o.id}" ${filters.occasion === o.id ? 'selected' : ''}>${o.name}</option>
            `).join('')}
          </optgroup>
          ${customOccasions.length ? `
            <optgroup label="Eigene Anlässe">
              ${customOccasions.map(o => `
                <option value="${o.id}" ${filters.occasion === o.id ? 'selected' : ''}>${o.name}</option>
              `).join('')}
            </optgroup>
          ` : ''}
        </select>
      </div>

      <div>
        <select id="filterStatus" class="form-select">
          ${statuses.map(s => {
            let label = s === 'all' ? 'Alle Status' : s.charAt(0).toUpperCase() + s.slice(1);
            if (currentTab === 'ideas') {
              label = s === 'all' ? 'Alle Ideen' : 'Nur offene Ideen';
            }
            return `<option value="${s}" ${filters.status === s ? 'selected' : ''}>${label}</option>`;
          }).join('')}
        </select>
      </div>

      <div class="ms-auto">
        <button class="btn btn-primary" id="addItemBtn">
          <i class="bi bi-plus-circle"></i> Neu
        </button>
      </div>
    </div>
  `;
}

function renderList() {
  const listDiv = document.getElementById('listContainer');
  const src     = applyFilters(currentTab === 'gifts' ? gifts : ideas);

  if (!src.length) {
    listDiv.innerHTML = `
      <div class="text-center py-5 text-muted">
        <i class="bi bi-inbox" style="font-size: 3rem;"></i>
        <h5 class="mt-3">Keine ${currentTab === 'gifts' ? 'Geschenke' : 'Geschenkideen'} gefunden</h5>
        <p>Klicke auf "Neu" um ${currentTab === 'gifts' ? 'ein Geschenk' : 'eine Geschenkidee'} hinzuzufügen.</p>
      </div>
    `;
    return;
  }

  const cards = src.map(item => currentTab === 'gifts'
    ? renderGiftCard(item)
    : renderIdeaCard(item)
  ).join('');

  listDiv.innerHTML = `<div class="row g-3">${cards}</div>`;
}

function renderGiftCard(item) {
  const statusBadge = item.status === 'ueberreicht' ? 'success' : item.status === 'besorgt' ? 'info' : 'warning';
  const statusText  = item.status === 'ueberreicht' ? 'Überreicht' : item.status === 'besorgt' ? 'Besorgt' : 'Offen';

  return `
    <div class="col-12 col-md-6 col-lg-4">
      <div class="card h-100 gift-card" data-id="${item.id}">
        <div class="card-body">
          <h2 class="gift-primary-title">
            <i class="bi bi-gift-fill text-primary"></i>
            ${item.giftName || item.occasionName || 'Geschenk'}
          </h2>

          <div class="mb-3">
            <span class="badge bg-${statusBadge}">${statusText}</span>
          </div>

          <div class="gift-meta-list">
            <div class="gift-meta-item">
              <i class="bi bi-calendar-event text-muted"></i>
              <span class="fw-semibold">Datum:</span>
              <span>${item.date}</span>
            </div>
            <div class="gift-meta-item">
              <i class="bi bi-person text-muted"></i>
              <span class="fw-semibold">Person:</span>
              <span>${item.personName}</span>
            </div>
            ${item.occasionName ? `
              <div class="gift-meta-item">
                <i class="bi bi-star text-muted"></i>
                <span class="fw-semibold">Anlass:</span>
                <span>${item.occasionName}</span>
              </div>
            ` : ''}
            ${item.note ? `
              <div class="gift-meta-item">
                <i class="bi bi-chat-left-text text-muted"></i>
                <span class="fw-semibold">Notiz:</span>
                <span class="text-muted">${item.note}</span>
              </div>
            ` : ''}
            ${item.sourceIdeaId ? `
              <div class="gift-meta-item">
                <small class="badge bg-light text-dark">
                  <i class="bi bi-lightbulb"></i> Konvertiert aus Idee
                </small>
              </div>
            ` : ''}
          </div>

          <div class="d-flex gap-2 mt-3">
            <button class="btn btn-sm btn-outline-primary edit-btn flex-grow-1">
              <i class="bi bi-pencil"></i> Bearbeiten
            </button>
            <button class="btn btn-sm btn-outline-danger delete-btn">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderIdeaCard(item) {
  const statusBadge = item.status === 'erledigt' ? 'success' : item.status === 'besorgt' ? 'info' : 'warning';
  const statusText  = item.status === 'erledigt' ? 'Erledigt' : item.status === 'besorgt' ? 'Besorgt' : 'Offen';
  const cardTitle   = item.giftName || item.occasionName || 'Geschenkidee';
  const detailsText = item.note || (!(item.giftName) ? item.content : '');

  let contentPreview = '';
  if (item.imageUrl) {
    contentPreview = `
      <div class="text-center gift-image-preview">
        <img src="${item.imageUrl}" class="img-fluid rounded" style="max-height: 150px; object-fit: cover;" alt="Geschenkidee">
      </div>
    `;
  } else if (item.linkUrl) {
    contentPreview = `
      <a href="${item.linkUrl}" target="_blank" class="d-flex align-items-center text-decoration-none gift-link">
        <i class="bi bi-link-45deg me-2"></i>
        <span class="text-truncate">${item.linkUrl}</span>
      </a>
    `;
  } else if (detailsText) {
    contentPreview = `<p class="mb-0">${detailsText}</p>`;
  }

  return `
    <div class="col-12 col-md-6 col-lg-4">
      <div class="card h-100 gift-idea-card" data-id="${item.id}">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start mb-3">
            <div class="flex-grow-1">
              <h5 class="card-title mb-1">
                <i class="bi bi-lightbulb-fill text-warning"></i>
                ${cardTitle}
              </h5>
              <div class="text-muted small">
                <i class="bi bi-person"></i> ${item.personName}
              </div>
              ${item.occasionName && item.occasionName !== cardTitle ? `
                <div class="text-muted small">
                  <i class="bi bi-star"></i> ${item.occasionName}
                </div>
              ` : ''}
            </div>
            <span class="badge bg-${statusBadge}">${statusText}</span>
          </div>

          ${contentPreview ? `<div class="mb-3 gift-idea-content">${contentPreview}</div>` : ''}

          <div class="d-flex gap-2">
            <button class="btn btn-sm btn-outline-primary edit-btn">
              <i class="bi bi-pencil"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger delete-btn">
              <i class="bi bi-trash"></i>
            </button>
            <button class="btn btn-sm btn-success convert-btn flex-grow-1">
              <i class="bi bi-arrow-right-circle"></i> Konvertieren
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderForm() {
  const formDiv = document.getElementById('formContainer');

  if (formMode === 'none') {
    formDiv.innerHTML = '';
    formDiv.classList.add('d-none');
    return;
  }

  formDiv.classList.remove('d-none');

  if (formMode === 'convert') {
    renderConvertForm(formDiv);
    return;
  }

  renderEntityForm(formDiv);
}

function renderConvertForm(formDiv) {
  const idea = ideas.find(i => i.id === convertIdeaId);
  if (!idea) { formMode = 'none'; renderForm(); return; }
  const defaultGiftName = (idea.giftName || idea.content || '').trim();
  const defaultConvertDate = idea.date || '';

  formDiv.innerHTML = `
    <div class="card">
      <div class="card-header bg-success text-white">
        <h5 class="mb-0">
          <i class="bi bi-arrow-right-circle"></i> Geschenkidee in Geschenk konvertieren
        </h5>
      </div>
      <div class="card-body">
        <div class="alert alert-info">
          <strong>Idee:</strong> ${idea.content}<br>
          <strong>Für:</strong> ${idea.personName}
        </div>

        <form id="convertForm">
          <div class="mb-3">
            <label class="form-label">Name des Geschenks <span class="text-danger">*</span></label>
            <input type="text" id="convertGiftName" class="form-control" required
                   value="${defaultGiftName}"
                   placeholder="z.B. Amazon Gutschein, Buch 'Die Säulen der Erde'">
          </div>

          <div class="mb-3">
            <label class="form-label">Datum <span class="text-danger">*</span></label>
            <div class="input-group">
              <input type="date" id="convertDate" class="form-control" required
                     value="${defaultConvertDate}" style="cursor: pointer;">
              <span class="input-group-text"><i class="bi bi-calendar3"></i></span>
            </div>
            <small class="text-muted">
              <i class="bi bi-info-circle"></i> Klicke auf das Feld, um ein Datum auszuwählen
            </small>
          </div>

          <div class="mb-3">
            <label class="form-label">Notiz</label>
            <textarea id="convertNote" class="form-control" rows="3"
                      placeholder="Optional: Zusätzliche Informationen zum Geschenk"></textarea>
          </div>

          <div class="d-flex gap-2">
            <button type="submit" class="btn btn-success">
              <i class="bi bi-check-circle"></i> Konvertieren
            </button>
            <button type="button" class="btn btn-outline-secondary" id="cancelBtn">
              <i class="bi bi-x-circle"></i> Abbrechen
            </button>
          </div>
        </form>
      </div>
    </div>
  `;

  const dateInput = document.getElementById('convertDate');
  const dateGroup = dateInput.closest('.input-group');
  dateGroup.style.cursor = 'pointer';
  dateGroup.addEventListener('click', () => dateInput.showPicker?.());
}

function renderEntityForm(formDiv) {
  const isEdit  = formMode === 'edit';
  const item    = isEdit
    ? (currentTab === 'gifts' ? gifts.find(g => g.id === editingItem) : ideas.find(i => i.id === editingItem))
    : null;
  const title   = `${isEdit ? 'Bearbeiten' : 'Neu'}: ${currentTab === 'gifts' ? 'Geschenk' : 'Geschenkidee'}`;
  const customOccasions = getDeduplicatedOccasions();

  formDiv.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h5 class="mb-0">
          <i class="bi bi-${isEdit ? 'pencil' : 'plus-circle'}"></i> ${title}
        </h5>
      </div>
      <div class="card-body">
        <form id="entityForm">
          <div class="row">
            <div class="col-md-6 mb-3">
              <label class="form-label">Person <span class="text-danger">*</span></label>
              <select id="formPerson" class="form-select" required>
                <option value="">Bitte wählen...</option>
                ${persons.map(p => `
                  <option value="${p.id}" ${item && item.personId === p.id ? 'selected' : ''}>${p.name}</option>
                `).join('')}
              </select>
            </div>

            <div class="col-md-6 mb-3">
              <label class="form-label">Anlass</label>
              <select id="formOccasion" class="form-select">
                <option value="">Kein spezifischer Anlass</option>
                <optgroup label="Feste Anlässe">
                  ${FIXED_OCCASIONS.map(o => `
                    <option value="${o.id}" ${item && item.occasionId === o.id ? 'selected' : ''}>${o.name}</option>
                  `).join('')}
                </optgroup>
                ${customOccasions.length ? `
                  <optgroup label="Eigene Anlässe">
                    ${customOccasions.map(o => `
                      <option value="${o.id}" ${item && item.occasionId === o.id ? 'selected' : ''}>${o.name}</option>
                    `).join('')}
                  </optgroup>
                ` : ''}
                <option value="__custom__">➕ Individueller Anlass...</option>
              </select>
            </div>

            <div class="col-12 mb-3 d-none" id="customOccasionDiv">
              <label class="form-label">Individueller Anlass</label>
              <input type="text" id="formCustomOccasion" class="form-control"
                     placeholder="z.B. Hochzeitstag, Firmenjubiläum">
            </div>
          </div>

          ${currentTab === 'ideas' ? renderIdeaFormFields(item) : renderGiftFormFields(item)}

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
      </div>
    </div>
  `;

  // Custom Occasion Toggle
  const occasionSelect = document.getElementById('formOccasion');
  const customDiv      = document.getElementById('customOccasionDiv');
  if (occasionSelect) {
    occasionSelect.addEventListener('change', () => {
      const isCustom = occasionSelect.value === '__custom__';
      customDiv.classList.toggle('d-none', !isCustom);
      document.getElementById('formCustomOccasion').required = isCustom;
    });
  }

  // Datepicker für Geschenke
  if (currentTab === 'gifts') {
    const dateInput = document.getElementById('formDate');
    const dateGroup = dateInput?.closest('.input-group');
    if (dateGroup) {
      dateGroup.style.cursor = 'pointer';
      dateGroup.addEventListener('click', () => dateInput.showPicker?.());
    }
  } else if (currentTab === 'ideas') {
    const ideaDateInput = document.getElementById('formIdeaDate');
    const ideaDateGroup = ideaDateInput?.closest('.input-group');
    if (ideaDateGroup) {
      ideaDateGroup.style.cursor = 'pointer';
      ideaDateGroup.addEventListener('click', () => ideaDateInput.showPicker?.());
    }
  }
}

function renderIdeaFormFields(item) {
  const ideaGiftName = item
    ? (item.giftName || (!(item.note) ? item.content : '') || '')
    : '';
  const ideaDetails = item
    ? (item.note || (!(item.giftName) ? item.content : '') || '')
    : '';
  const ideaDate = item?.date || '';

  return `
    <div class="mb-3">
      <label class="form-label">Geschenkname</label>
      <input type="text" id="formGiftName" class="form-control"
             value="${ideaGiftName}"
             placeholder="z.B. Gutschein, Buch, Konzertkarten">
    </div>

    <div class="mb-3">
      <label class="form-label">Zusätzliche Informationen</label>
      <textarea id="formNote" class="form-control" rows="3"
                placeholder="Optional: Details zur Geschenkidee">${ideaDetails}</textarea>
    </div>

    <div class="mb-3">
      <label class="form-label">Datum (optional)</label>
      <div class="input-group">
        <input type="date" id="formIdeaDate" class="form-control"
               value="${ideaDate}" style="cursor: pointer;">
        <span class="input-group-text"><i class="bi bi-calendar3"></i></span>
      </div>
      <small class="text-muted">Wird beim Konvertieren als Geschenkdatum vorgeschlagen.</small>
    </div>

    <div class="mb-3">
      <label class="form-label">Medien</label>
      <div class="d-flex gap-2">
        <button type="button" class="btn btn-sm btn-outline-secondary" disabled>
          <i class="bi bi-image"></i> Bild hochladen
        </button>
        <button type="button" class="btn btn-sm btn-outline-secondary" disabled>
          <i class="bi bi-link-45deg"></i> Link einfügen
        </button>
      </div>
      <small class="text-muted"><i class="bi bi-info-circle"></i> Medienfunktion noch nicht implementiert</small>
    </div>

    <div class="mb-3">
      <label class="form-label">Status</label>
      <select id="formStatus" class="form-select">
        <option value="offen"    ${item && item.status === 'offen'    ? 'selected' : ''}>Offen</option>
        <option value="besorgt"  ${item && item.status === 'besorgt'  ? 'selected' : ''}>Besorgt</option>
        <option value="erledigt" ${item && item.status === 'erledigt' ? 'selected' : ''}>Erledigt</option>
      </select>
    </div>
  `;
}

function renderGiftFormFields(item) {
  return `
    <div class="mb-3">
      <label class="form-label">Name des Geschenks <span class="text-danger">*</span></label>
      <input type="text" id="formGiftName" class="form-control"
             value="${item ? item.giftName || '' : ''}" required
             placeholder="z.B. Amazon Gutschein, Buch 'Die Säulen der Erde'">
    </div>

    <div class="mb-3">
      <label class="form-label">Datum <span class="text-danger">*</span></label>
      <div class="input-group">
        <input type="date" id="formDate" class="form-control"
               value="${item ? item.date : ''}" required style="cursor: pointer;">
        <span class="input-group-text"><i class="bi bi-calendar3"></i></span>
      </div>
    </div>

    <div class="mb-3">
      <label class="form-label">Notiz</label>
      <textarea id="formNote" class="form-control" rows="3"
                placeholder="Optional: Zusätzliche Informationen">${item ? item.note || '' : ''}</textarea>
    </div>

    <div class="mb-3">
      <label class="form-label">Medien</label>
      <div class="d-flex gap-2">
        <button type="button" class="btn btn-sm btn-outline-secondary" disabled>
          <i class="bi bi-image"></i> Bild hochladen
        </button>
        <button type="button" class="btn btn-sm btn-outline-secondary" disabled>
          <i class="bi bi-link-45deg"></i> Link einfügen
        </button>
      </div>
      <small class="text-muted"><i class="bi bi-info-circle"></i> Medienfunktion noch nicht implementiert</small>
    </div>

    <div class="mb-3">
      <label class="form-label">Status</label>
      <select id="formStatus" class="form-select">
        <option value="offen"      ${item && item.status === 'offen'      ? 'selected' : ''}>Offen</option>
        <option value="besorgt"    ${item && item.status === 'besorgt'    ? 'selected' : ''}>Besorgt</option>
        <option value="ueberreicht" ${item && item.status === 'ueberreicht' ? 'selected' : ''}>Überreicht</option>
      </select>
    </div>
  `;
}

// ---------- Event Handlers ----------

function attachEventListeners(ctx) {
  removeAllListeners();

  // Tabs
  document.querySelectorAll('#giftsTabs .nav-link').forEach(tab => {
    addListener(tab, 'click', (e) => {
      e.preventDefault();
      currentTab    = tab.dataset.tab;
      filters       = { search: '', person: 'all', status: 'all', occasion: 'all' };
      editingItem   = null;
      formMode      = 'none';
      convertIdeaId = null;

      document.querySelectorAll('#giftsTabs .nav-link').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      renderFilters(document.getElementById('tabFilters'));
      renderList();
      renderForm();
      attachEventListeners(ctx);
    });
  });

  // Filter-Controls
  addListener(document.getElementById('giftsSearch'), 'input', (e) => {
    filters.search = e.target.value;
    renderList();
    attachListListeners();
  });

  addListener(document.getElementById('filterPerson'), 'change', (e) => {
    filters.person = e.target.value;
    renderList();
    attachListListeners();
  });

  addListener(document.getElementById('filterOccasion'), 'change', (e) => {
    filters.occasion = e.target.value;
    renderList();
    attachListListeners();
  });

  addListener(document.getElementById('filterStatus'), 'change', (e) => {
    filters.status = e.target.value;
    renderList();
    attachListListeners();
  });

  // "Neu"-Button
  addListener(document.getElementById('addItemBtn'), 'click', (e) => {
    e.preventDefault();
    formMode    = 'create';
    editingItem = null;
    renderForm();
    window.scrollTo(0, 0);
    attachEventListeners(ctx);
  });

  // Formular
  const formEl = document.getElementById('entityForm');
  addListener(formEl, 'submit', (e) => handleFormSubmit(e, ctx));

  const convertForm = document.getElementById('convertForm');
  addListener(convertForm, 'submit', (e) => handleConvertSubmit(e, ctx));

  addListener(document.getElementById('cancelBtn'), 'click', () => {
    formMode      = 'none';
    editingItem   = null;
    convertIdeaId = null;
    renderForm();
    attachEventListeners(ctx);
  });

  addListener(document.getElementById('deleteBtn'), 'click', () => handleDelete(ctx));

  attachListListeners();
}

async function handleFormSubmit(e, ctx) {
  e.preventDefault();

  const user = await waitForUserOnce();
  if (!user) { window.location.href = './login.html'; return; }

  const formEl = document.getElementById('entityForm');
  const btn    = formEl.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Speichere...';

  try {
    const personId   = document.getElementById('formPerson').value;
    const personName = persons.find(p => p.id === personId)?.name || '';

    let occasionId   = document.getElementById('formOccasion').value || null;
    let occasionName = '';

    if (occasionId === '__custom__') {
      occasionName = document.getElementById('formCustomOccasion').value.trim();
      occasionId   = null;
    } else if (occasionId) {
      occasionName = resolveOccasionName(occasionId);
    }

    const giftName = document.getElementById('formGiftName')?.value.trim() || '';
    const note     = document.getElementById('formNote')?.value.trim()     || '';
    const status   = document.getElementById('formStatus').value;

    if (currentTab === 'gifts') {
      const date = document.getElementById('formDate').value;

      if (!personId || !date || !giftName) {
        alert('Person, Name und Datum sind erforderlich');
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-check-circle"></i> Speichern';
        return;
      }

      if (formMode === 'edit' && editingItem) {
        await updateGift(editingItem, { personId, personName, occasionId, occasionName, giftName, date, note, status });
      } else {
        await createGift({ personId, personName, occasionId, occasionName, giftName, date, note, status });
      }
    } else {
      const ideaDate = document.getElementById('formIdeaDate')?.value || '';

      if (!personId) {
        alert('Person ist erforderlich');
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-check-circle"></i> Speichern';
        return;
      }

      if (!giftName && !note) {
        alert('Bitte gib mindestens einen Geschenknamen oder zusätzliche Informationen ein');
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-check-circle"></i> Speichern';
        return;
      }

      // Kompatibilitätsfelder: type und content werden weiter befüllt
      const type    = 'text';
      const content = note || giftName || '';

      if (formMode === 'edit' && editingItem) {
        await updateGiftIdea(editingItem, {
          personId, personName, occasionId, occasionName, giftName, type, content, note, date: ideaDate, status
        });
      } else {
        await createGiftIdea({
          personId, personName, occasionId, occasionName, giftName, type, content, note, date: ideaDate, status
        });
      }
    }

    await loadData();
    formMode    = 'none';
    editingItem = null;

    renderFilters(document.getElementById('tabFilters'));
    renderList();
    renderForm();
    attachEventListeners(ctx);
  } catch (err) {
    console.error(err);
    alert('Fehler: ' + err.message);
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-check-circle"></i> Speichern';
  }
}

async function handleConvertSubmit(e, ctx) {
  e.preventDefault();

  const user = await waitForUserOnce();
  if (!user) { window.location.href = './login.html'; return; }

  const convertForm = document.getElementById('convertForm');
  const btn         = convertForm.querySelector('button[type="submit"]');
  const date        = document.getElementById('convertDate').value;
  const note        = document.getElementById('convertNote').value;
  const giftName    = document.getElementById('convertGiftName').value.trim();

  if (!date || !giftName) {
    alert('Bitte fülle alle Pflichtfelder aus!');
    return;
  }

  try {
    btn.disabled  = true;
    btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Wird konvertiert...';

    await convertIdeaToGift(convertIdeaId, { date, note, giftName });

    await loadData();
    formMode      = 'none';
    convertIdeaId = null;
    currentTab    = 'gifts';

    document.querySelectorAll('#giftsTabs .nav-link').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === 'gifts');
    });

    renderFilters(document.getElementById('tabFilters'));
    renderList();
    renderForm();
    attachEventListeners(ctx);
  } catch (err) {
    console.error(err);
    alert('Fehler beim Konvertieren: ' + err.message);
    btn.disabled  = false;
    btn.innerHTML = '<i class="bi bi-check-circle"></i> Konvertieren';
  }
}

async function handleDelete(ctx) {
  const source = currentTab === 'gifts' ? gifts : ideas;
  const item = source.find(x => x.id === editingItem);
  const itemLabel = item?.giftName || item?.occasionName || item?.personName || '';
  const shouldDelete = await showDeleteConfirmModal(itemLabel);
  if (!shouldDelete) return;

  const user = await waitForUserOnce();
  if (!user) { window.location.href = './login.html'; return; }

  try {
    if (currentTab === 'gifts') await deleteGift(editingItem);
    else                        await deleteGiftIdea(editingItem);

    await loadData();
    formMode    = 'none';
    editingItem = null;

    renderFilters(document.getElementById('tabFilters'));
    renderList();
    renderForm();
    attachEventListeners(ctx);
  } catch (err) {
    console.error(err);
    const label = currentTab === 'gifts' ? 'Das Geschenk' : 'Die Geschenkidee';
    alert(getDeleteFailedMessage(err, label));
  }
}

function attachListListeners() {
  document.querySelectorAll('#listContainer .edit-btn').forEach(btn => {
    addListener(btn, 'click', (e) => {
      e.preventDefault();
      editingItem = btn.closest('[data-id]').dataset.id;
      formMode    = 'edit';
      renderForm();
      window.scrollTo(0, 0);
      attachEventListeners();
    });
  });

  document.querySelectorAll('#listContainer .delete-btn').forEach(btn => {
    addListener(btn, 'click', async (e) => {
      e.preventDefault();
      const id = btn.closest('[data-id]').dataset.id;
      const source = currentTab === 'gifts' ? gifts : ideas;
      const item = source.find(x => x.id === id);
      const itemLabel = item?.giftName || item?.occasionName || item?.personName || '';
      const shouldDelete = await showDeleteConfirmModal(itemLabel);
      if (!shouldDelete) return;

      const user = await waitForUserOnce();
      if (!user) { window.location.href = './login.html'; return; }

      try {
        if (currentTab === 'gifts') await deleteGift(id);
        else                        await deleteGiftIdea(id);

        await loadData();
        renderList();
        attachListListeners();
      } catch (err) {
        console.error(err);
        const label = currentTab === 'gifts' ? 'Das Geschenk' : 'Die Geschenkidee';
        alert(getDeleteFailedMessage(err, label));
      }
    });
  });

  if (currentTab === 'ideas') {
    document.querySelectorAll('#listContainer .convert-btn').forEach(btn => {
      addListener(btn, 'click', (e) => {
        e.preventDefault();
        convertIdeaId = btn.closest('[data-id]').dataset.id;
        formMode      = 'convert';
        renderForm();
        window.scrollTo(0, 0);
        attachEventListeners();
      });
    });
  }
}

// ---------- Public API ----------

export async function render(container, ctx) {
  ctx.setPageHeader('Geschenke & Ideen', 'Verwalte hier deine Geschenke und Geschenkideen.');

  if (ctx.params) {
    if (ctx.params.tab === 'gifts' || ctx.params.tab === 'ideas') currentTab = ctx.params.tab;
    if (ctx.params.status) filters.status = ctx.params.status;
  }

  if (!isAuthed()) {
    container.innerHTML = `
      <div class="alert alert-warning">
        <h6 class="alert-heading">Bitte einloggen</h6>
        <a class="btn btn-sm btn-primary" href="./login.html">Zum Login</a>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="gifts-manager">
      <ul class="nav nav-tabs mb-4" id="giftsTabs" role="tablist">
        <li class="nav-item" role="presentation">
          <a class="nav-link ${currentTab === 'gifts' ? 'active' : ''}" href="#" data-tab="gifts" role="tab">
            <i class="bi bi-gift"></i> Geschenke
          </a>
        </li>
        <li class="nav-item" role="presentation">
          <a class="nav-link ${currentTab === 'ideas' ? 'active' : ''}" href="#" data-tab="ideas" role="tab">
            <i class="bi bi-lightbulb"></i> Geschenkideen
          </a>
        </li>
      </ul>

      <div id="tabFilters"></div>

      <div id="giftsLoading" class="text-center my-3 d-none">
        <div class="spinner-border" role="status"><span class="visually-hidden">Lädt...</span></div>
      </div>

      <div id="formContainer" class="mb-4"></div>
      <div id="listContainer"></div>
    </div>
  `;

  await loadData();
  renderFilters(document.getElementById('tabFilters'));
  renderList();
  renderForm();
  attachEventListeners(ctx);
}

export function destroy() {
  if (activeDeleteModalCleanup) activeDeleteModalCleanup(false);
  removeAllListeners();
  gifts = []; ideas = []; persons = []; occasions = [];
  editingItem   = null;
  formMode      = 'none';
  convertIdeaId = null;
}
