/**
 * occasions-section.js
 * -------------------------------------------------------
 * Anlässe-Verwaltung
 * - Kartendesign mit Countdown und Typ-Unterscheidung
 * - Feste Anlässe (type: "fixed") sind schreibgeschützt
 * - Filter nach Zeitraum, Typ und Status
 */

import {
  listOccasions,
  createOccasion,
  updateOccasion,
  deleteOccasion,
  ensureDefaultOccasions,
} from "../occasion-service.js";

import { listPersons as getPersonsList } from "../person-service.js";
import {
  waitForUserOnce,
  isAuthed,
  USE_FIREBASE_AUTH,
} from "../auth-adapter.js";

// ---------- State ----------

let allOccasions = [];
let filteredOccasions = [];
let allPersons = [];
let editingId = null;
let mode = "none"; // 'none' | 'create' | 'edit'
let eventListeners = [];
let activeDeleteModalCleanup = null;

let filters = {
  search: "",
  timeframe: "365", // '30' | '90' | '365' | 'all'
  type: "all", // 'all' | 'fixed' | 'custom'
  status: "all", // 'all' | 'active' | 'inactive'
};

const FIXED_OCCASION_PRESETS = ["Geburtstag", "Weihnachten"];

// ---------- Date Helpers ----------

function _asDate(val) {
  if (!val) return null;
  if (typeof val === "object" && typeof val.toDate === "function")
    return val.toDate();
  if (val instanceof Date) return val;
  if (typeof val === "string") {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function _toInputDate(val) {
  if (!val) return "";
  if (typeof val === "string") return val;
  return _asDate(val)?.toISOString().slice(0, 10) || "";
}

function _formatDate(dateVal) {
  const d = _asDate(dateVal);
  return d
    ? d.toLocaleDateString("de-DE", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "—";
}

function _daysUntil(dateVal) {
  const d = _asDate(dateVal);
  if (!d) return null;
  const now = new Date();
  d.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return Math.floor((d - now) / (1000 * 60 * 60 * 24));
}

function isFixedOccasion(occasion) {
  const type = String(occasion?.type || "")
    .trim()
    .toLowerCase();
  const name = String(occasion?.name || "").trim();
  return type === "fixed" || FIXED_OCCASION_PRESETS.includes(name);
}

// ---------- Event Listener Helpers ----------

function addListener(el, evt, fn) {
  if (!el) return;
  el.addEventListener(evt, fn);
  eventListeners.push({ el, evt, fn });
}

function removeAllListeners() {
  eventListeners.forEach(({ el, evt, fn }) => el.removeEventListener(evt, fn));
  eventListeners = [];
}

// ---------- Delete Confirmation Modal ----------

function showDeleteConfirmModal(name = "") {
  if (activeDeleteModalCleanup) activeDeleteModalCleanup(false);

  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "occasion-delete-modal-backdrop";
    backdrop.innerHTML = `
      <div class="occasion-delete-modal" role="dialog" aria-modal="true" aria-labelledby="occasionDeleteModalTitle" tabindex="-1">
        <div class="occasion-delete-modal-header">
          <h5 id="occasionDeleteModalTitle" class="mb-0">
            <i class="bi bi-exclamation-triangle text-danger"></i> Anlass löschen
          </h5>
          <button type="button" class="btn-close" aria-label="Schliessen"></button>
        </div>
        <div class="occasion-delete-modal-body">
          <p class="mb-2">Möchtest du diesen Anlass wirklich löschen?</p>
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

    const modalEl = backdrop.querySelector(".occasion-delete-modal");
    const closeBtn = backdrop.querySelector(".btn-close");
    const cancelBtn = backdrop.querySelector('[data-action="cancel"]');
    const confirmBtn = backdrop.querySelector('[data-action="confirm"]');
    const nameEl = backdrop.querySelector(".occasion-delete-modal-name");

    if (name) {
      nameEl.textContent = `Anlass: "${name}"`;
    } else {
      nameEl.remove();
    }

    const finish = (result) => {
      document.removeEventListener("keydown", onKeydown);
      backdrop.removeEventListener("click", onBackdropClick);
      closeBtn.removeEventListener("click", onCancel);
      cancelBtn.removeEventListener("click", onCancel);
      confirmBtn.removeEventListener("click", onConfirm);
      backdrop.remove();
      document.body.classList.remove("occasion-delete-modal-open");
      if (activeDeleteModalCleanup === finish) activeDeleteModalCleanup = null;
      resolve(result);
    };

    const onCancel = () => finish(false);
    const onConfirm = () => finish(true);
    const onBackdropClick = (e) => {
      if (e.target === backdrop) onCancel();
    };
    const onKeydown = (e) => {
      if (e.key === "Escape") onCancel();
    };

    activeDeleteModalCleanup = finish;
    document.body.classList.add("occasion-delete-modal-open");
    document.body.appendChild(backdrop);
    document.addEventListener("keydown", onKeydown);
    backdrop.addEventListener("click", onBackdropClick);
    closeBtn.addEventListener("click", onCancel);
    cancelBtn.addEventListener("click", onCancel);
    confirmBtn.addEventListener("click", onConfirm);

    modalEl.focus?.();
    confirmBtn.focus();
  });
}

// ---------- Public API ----------

export async function render(container, ctx) {
  ctx.setPageHeader(
    "Anlässe verwalten",
    "Verwalte wichtige Anlässe und Termine. Feste Anlässe wie Geburtstage sind vordefiniert.",
  );

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

  try {
    if (USE_FIREBASE_AUTH && isAuthed()) await ensureDefaultOccasions();
    allOccasions = await listOccasions();
  } catch (err) {
    console.warn("Fehler beim Laden von Anlässen:", err);
    container.innerHTML = `
      <div class="alert alert-warning">
        Anlässe konnten nicht geladen werden.
        <div class="mt-2"><a class="btn btn-sm btn-primary" href="./login.html">Zum Login</a></div>
      </div>
    `;
    return;
  }

  try {
    allPersons = await getPersonsList();
  } catch (err) {
    console.warn("Fehler beim Laden von Personen:", err);
    allPersons = [];
  }

  filteredOccasions = [...allOccasions];
  mode = "none";
  editingId = null;

  container.innerHTML = `
    <div class="occasions-manager">
      <div id="tabFilters" class="mb-3"></div>
      <div id="formContainer" class="mb-4"></div>
      <div id="listContainer"></div>
    </div>
  `;

  renderFilters();
  applyFilters();
  renderList();
  renderForm();

  // Auf spezifischen Anlass scrollen falls per Navigation übergeben
  if (ctx.params?.id) {
    const card = container.querySelector(`[data-id="${ctx.params.id}"]`);
    card?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  attachEventListeners(ctx);
}

// ---------- Rendering ----------

function renderFilters() {
  const filterDiv = document.getElementById("tabFilters");
  filterDiv.innerHTML = `
    <div class="d-flex gap-3 align-items-center flex-wrap">
      <div style="flex: 1; min-width: 250px;">
        <input type="text" id="occasionSearch" class="form-control" placeholder="Suche nach Name oder Person...">
      </div>

      <div>
        <select id="filterTimeframe" class="form-select">
          <option value="30">Nächste 30 Tage</option>
          <option value="90">Nächste 90 Tage</option>
          <option value="365" selected>Nächstes Jahr</option>
          <option value="all">Alle</option>
        </select>
      </div>

      <div>
        <select id="filterType" class="form-select">
          <option value="all">Alle Typen</option>
          <option value="fixed">Fest (Geburtstag, Weihnachten)</option>
          <option value="custom">Eigene Anlässe</option>
        </select>
      </div>

      <div>
        <select id="filterStatus" class="form-select">
          <option value="all">Alle Status</option>
          <option value="active">Aktiv</option>
          <option value="inactive">Deaktiviert</option>
        </select>
      </div>

      <div class="ms-auto">
        <button class="btn btn-primary" id="addOccasionBtn">
          <i class="bi bi-plus-circle"></i> Neu
        </button>
      </div>
    </div>
  `;
}

function applyFilters() {
  const term = filters.search.toLowerCase();

  filteredOccasions = allOccasions.filter((occ) => {
    if (term) {
      const hay = [occ.name, occ.person || ""].join(" ").toLowerCase();
      if (!hay.includes(term)) return false;
    }

    if (filters.timeframe !== "all") {
      const days = _daysUntil(occ.date);
      if (days === null || days < 0 || days > parseInt(filters.timeframe))
        return false;
    }

    if (filters.type !== "all") {
      const fixed = isFixedOccasion(occ);
      if (filters.type === "fixed" && !fixed) return false;
      if (filters.type === "custom" && fixed) return false;
    }

    if (filters.status !== "all") {
      if (filters.status === "active" && !occ.isActive) return false;
      if (filters.status === "inactive" && occ.isActive) return false;
    }

    return true;
  });
}

function renderList() {
  const listDiv = document.getElementById("listContainer");

  if (!filteredOccasions.length) {
    listDiv.innerHTML = `
      <div class="text-center py-5 text-muted">
        <i class="bi bi-calendar-x" style="font-size: 3rem;"></i>
        <h5 class="mt-3">Keine Anlässe gefunden</h5>
        <p>Klicke auf "Neu" um einen Anlass hinzuzufügen.</p>
      </div>
    `;
    return;
  }

  const sorted = [...filteredOccasions].sort((a, b) => {
    const da = _asDate(a.date) || new Date("9999-12-31");
    const db = _asDate(b.date) || new Date("9999-12-31");
    return da - db;
  });

  const cards = sorted
    .map((occ) => {
      const isFixed = isFixedOccasion(occ);
      const daysUntil = _daysUntil(occ.date);
      const statusBadge = occ.isActive ? "success" : "secondary";
      const statusText = occ.isActive ? "Aktiv" : "Deaktiviert";

      let urgencyText = "";
      let urgencyClass = "";

      if (daysUntil !== null) {
        if (daysUntil < 0) {
          urgencyText = "Vergangen";
          urgencyClass = "text-muted";
        } else if (daysUntil === 0) {
          urgencyText = "Heute!";
          urgencyClass = "text-danger fw-bold";
        } else if (daysUntil <= 7) {
          urgencyText = `In ${daysUntil} Tag${daysUntil === 1 ? "" : "en"}`;
          urgencyClass = "text-warning fw-semibold";
        } else if (daysUntil <= 30) {
          urgencyText = `In ${daysUntil} Tagen`;
          urgencyClass = "text-info";
        } else {
          urgencyText = `In ${daysUntil} Tagen`;
          urgencyClass = "text-muted";
        }
      }

      return `
      <div class="col-12 col-md-6 col-lg-6">
        <div class="card h-100 occasion-card ${isFixed ? "occasion-card-fixed" : ""}" data-id="${occ.id}">
          <div class="card-body">
            <h2 class="occasion-primary-title">
              <i class="bi bi-calendar-event-fill ${isFixed ? "text-primary" : "text-success"}"></i>
              ${occ.name}
            </h2>

            <div class="mb-3">
              <span class="badge ${isFixed ? "bg-primary" : "bg-success"}">${isFixed ? "Fest" : "Eigener Anlass"}</span>
              <span class="badge bg-${statusBadge} ms-2">${statusText}</span>
            </div>

            <div class="occasion-meta-list">
              <div class="occasion-meta-item">
                <i class="bi bi-calendar3 text-muted"></i>
                <span class="fw-semibold">Datum:</span>
                <span class="text-nowrap">${_formatDate(occ.date)}</span>
              </div>

              ${
                urgencyText
                  ? `
                <div class="occasion-meta-item">
                  <i class="bi bi-clock text-muted"></i>
                  <span class="fw-semibold">Countdown:</span>
                  <span class="${urgencyClass}">${urgencyText}</span>
                </div>
              `
                  : ""
              }

              ${
                occ.person
                  ? `
                <div class="occasion-meta-item">
                  <i class="bi bi-person text-muted"></i>
                  <span class="fw-semibold">Person:</span>
                  <span>${occ.person}</span>
                </div>
              `
                  : ""
              }

              ${
                occ.info
                  ? `
                <div class="occasion-meta-item">
                  <i class="bi bi-info-circle text-muted"></i>
                  <span class="fw-semibold">Info:</span>
                  <span class="text-muted">${occ.info}</span>
                </div>
              `
                  : ""
              }
            </div>

            <div class="d-flex gap-2 mt-3">
              ${
                isFixed
                  ? `
                <button class="btn btn-sm btn-outline-secondary flex-grow-1" disabled>
                  <i class="bi bi-lock"></i> Fest (nicht bearbeitbar)
                </button>
              `
                  : `
                <button class="btn btn-sm btn-outline-primary edit-btn flex-grow-1">
                  <i class="bi bi-pencil"></i> Bearbeiten
                </button>
                <button class="btn btn-sm btn-outline-danger delete-btn">
                  <i class="bi bi-trash"></i>
                </button>
              `
              }
            </div>
          </div>
        </div>
      </div>
    `;
    })
    .join("");

  listDiv.innerHTML = `<div class="row g-3">${cards}</div>`;
}

function renderForm() {
  const formDiv = document.getElementById("formContainer");

  if (mode === "none") {
    formDiv.innerHTML = "";
    formDiv.classList.add("d-none");
    return;
  }

  formDiv.classList.remove("d-none");

  const isEdit = mode === "edit";
  const item = isEdit ? allOccasions.find((o) => o.id === editingId) : null;
  const title = isEdit ? "Anlass bearbeiten" : "Neuer Anlass";
  const selectedPreset = item
    ? FIXED_OCCASION_PRESETS.includes(String(item.name || "").trim())
      ? String(item.name || "").trim()
      : "__custom__"
    : "";
  const customNameDefault =
    item && selectedPreset === "__custom__" ? String(item.name || "") : "";
  const customNameHidden = selectedPreset === "__custom__" ? "" : "d-none";

  formDiv.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h5 class="mb-0">
          <i class="bi bi-${isEdit ? "pencil" : "plus-circle"}"></i> ${title}
        </h5>
      </div>
      <div class="card-body">
        <form id="occasionForm">
          <div class="row">
            <div class="col-md-6 mb-3">
              <label class="form-label">Name <span class="text-danger">*</span></label>
              <select id="formNamePreset" class="form-select" required>
                <option value="" ${!selectedPreset ? "selected" : ""}>Bitte wählen...</option>
                ${FIXED_OCCASION_PRESETS.map(
                  (name) => `
                  <option value="${name}" ${selectedPreset === name ? "selected" : ""}>${name}</option>
                `,
                ).join("")}
                <option value="__custom__" ${selectedPreset === "__custom__" ? "selected" : ""}>Individueller Anlass...</option>
              </select>
            </div>

            <div class="col-md-6 mb-3">
              <label class="form-label">Datum <span class="text-danger">*</span></label>
              <div class="input-group">
                <input type="date" id="formDate" class="form-control"
                       value="${item ? _toInputDate(item.date) : ""}" required style="cursor: pointer;">
                <span class="input-group-text"><i class="bi bi-calendar3"></i></span>
              </div>
            </div>
          </div>

          <div class="row">
            <div class="col-md-6 mb-3 ${customNameHidden}" id="customNameWrap">
              <label class="form-label">Individueller Anlass <span class="text-danger">*</span></label>
              <input type="text" id="formCustomName" class="form-control"
                     value="${customNameDefault}"
                     placeholder="z.B. Hochzeitstag, Firmenjubiläum">
            </div>
          </div>

          <div class="row">
            <div class="col-md-6 mb-3">
              <label class="form-label">Person (optional)</label>
              <select id="formPerson" class="form-select">
                <option value="">Keine spezifische Person</option>
                ${allPersons
                  .map(
                    (p) => `
                  <option value="${p.name}" ${item && item.person === p.name ? "selected" : ""}>
                    ${p.name}
                  </option>
                `,
                  )
                  .join("")}
              </select>
            </div>

            <div class="col-md-6 mb-3">
              <label class="form-label">Status</label>
              <select id="formStatus" class="form-select">
                <option value="true"  ${item && item.isActive !== false ? "selected" : ""}>Aktiv</option>
                <option value="false" ${item && item.isActive === false ? "selected" : ""}>Deaktiviert</option>
              </select>
            </div>
          </div>

          <div class="mb-3">
            <label class="form-label">Zusätzliche Informationen</label>
            <textarea id="formInfo" class="form-control" rows="3"
                      placeholder="Optional: Weitere Details zum Anlass">${item ? item.info || "" : ""}</textarea>
          </div>

          <div class="d-flex gap-2">
            <button type="submit" class="btn btn-primary">
              <i class="bi bi-check-circle"></i> Speichern
            </button>
            <button type="button" class="btn btn-outline-secondary" id="cancelBtn">
              <i class="bi bi-x-circle"></i> Abbrechen
            </button>
            ${
              isEdit
                ? `
              <button type="button" class="btn btn-outline-danger ms-auto" id="deleteBtn">
                <i class="bi bi-trash"></i> Löschen
              </button>
            `
                : ""
            }
          </div>
        </form>
      </div>
    </div>
  `;

  // Datepicker: Klick auf die ganze Gruppe öffnet den Picker
  const dateInput = document.getElementById("formDate");
  const dateGroup = dateInput.closest(".input-group");
  dateGroup.style.cursor = "pointer";
  dateGroup.addEventListener("click", () => dateInput.showPicker?.());

  const namePreset = document.getElementById("formNamePreset");
  const customNameWrap = document.getElementById("customNameWrap");
  const customNameInput = document.getElementById("formCustomName");
  if (namePreset && customNameWrap && customNameInput) {
    const syncNamePresetState = () => {
      const isCustom = namePreset.value === "__custom__";
      customNameWrap.classList.toggle("d-none", !isCustom);
      customNameInput.required = isCustom;
      if (!isCustom) customNameInput.value = "";
    };
    namePreset.addEventListener("change", syncNamePresetState);
    syncNamePresetState();
  }
}
// ---------- Event Handlers ----------

function attachEventListeners(ctx) {
  removeAllListeners();

  // Filter
  addListener(document.getElementById("occasionSearch"), "input", (e) => {
    filters.search = e.target.value;
    applyFilters();
    renderList();
    attachListListeners();
  });

  addListener(document.getElementById("filterTimeframe"), "change", (e) => {
    filters.timeframe = e.target.value;
    applyFilters();
    renderList();
    attachListListeners();
  });

  addListener(document.getElementById("filterType"), "change", (e) => {
    filters.type = e.target.value;
    applyFilters();
    renderList();
    attachListListeners();
  });

  addListener(document.getElementById("filterStatus"), "change", (e) => {
    filters.status = e.target.value;
    applyFilters();
    renderList();
    attachListListeners();
  });

  // "Neu"-Button
  addListener(document.getElementById("addOccasionBtn"), "click", (e) => {
    e.preventDefault();
    mode = "create";
    editingId = null;
    renderForm();
    window.scrollTo(0, 0);
    attachEventListeners(ctx);
  });

  // Formular
  const formEl = document.getElementById("occasionForm");
  addListener(formEl, "submit", async (e) => {
    e.preventDefault();

    const user = await waitForUserOnce();
    if (!user) {
      window.location.href = "./login.html";
      return;
    }

    const btn = formEl.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Speichere...';

    try {
      const selected = document.getElementById("formNamePreset")?.value || "";
      const isCustomName = selected === "__custom__";
      const name = isCustomName
        ? document.getElementById("formCustomName")?.value.trim() || ""
        : String(selected).trim();
      const type = isCustomName ? "custom" : "fixed";
      const date = document.getElementById("formDate").value;
      const person = document.getElementById("formPerson").value;
      const info = document.getElementById("formInfo").value.trim();
      const isActive = document.getElementById("formStatus").value === "true";

      if (!name || !date) {
        alert("Name und Datum sind Pflichtfelder");
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-check-circle"></i> Speichern';
        return;
      }

      if (mode === "edit" && editingId) {
        await updateOccasion(editingId, {
          name,
          date,
          person,
          type,
          info,
          isActive,
        });
      } else {
        await createOccasion({ name, date, person, type, info, isActive });
      }

      allOccasions = await listOccasions();
      mode = "none";
      editingId = null;

      applyFilters();
      renderList();
      renderForm();
      attachEventListeners(ctx);
    } catch (err) {
      console.error(err);
      alert("Fehler: " + err.message);
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-check-circle"></i> Speichern';
    }
  });

  addListener(document.getElementById("cancelBtn"), "click", () => {
    mode = "none";
    editingId = null;
    renderForm();
    attachEventListeners(ctx);
  });

  addListener(document.getElementById("deleteBtn"), "click", async () => {
    const item = allOccasions.find((o) => o.id === editingId);
    const shouldDelete = await showDeleteConfirmModal(item?.name || "");
    if (!shouldDelete) return;

    const user = await waitForUserOnce();
    if (!user) {
      window.location.href = "./login.html";
      return;
    }

    try {
      await deleteOccasion(editingId);
      allOccasions = await listOccasions();
      mode = "none";
      editingId = null;

      applyFilters();
      renderList();
      renderForm();
      attachEventListeners(ctx);
    } catch (err) {
      console.error(err);
      alert("Fehler: " + err.message);
    }
  });

  attachListListeners();
}

function attachListListeners() {
  // Bearbeiten
  document.querySelectorAll("#listContainer .edit-btn").forEach((btn) => {
    addListener(btn, "click", (e) => {
      e.preventDefault();
      editingId = btn.closest("[data-id]").dataset.id;
      mode = "edit";
      renderForm();
      window.scrollTo(0, 0);
      attachEventListeners();
    });
  });

  // Löschen
  document.querySelectorAll("#listContainer .delete-btn").forEach((btn) => {
    addListener(btn, "click", async (e) => {
      e.preventDefault();

      const id = btn.closest("[data-id]").dataset.id;
      const occ = allOccasions.find((o) => o.id === id);
      const shouldDelete = await showDeleteConfirmModal(occ?.name || "");
      if (!shouldDelete) return;

      const user = await waitForUserOnce();
      if (!user) {
        window.location.href = "./login.html";
        return;
      }

      try {
        await deleteOccasion(id);
        allOccasions = await listOccasions();
        applyFilters();
        renderList();
        attachListListeners();
      } catch (err) {
        console.error(err);
        alert("Fehler: " + err.message);
      }
    });
  });
}

// ---------- Lifecycle ----------

export function destroy() {
  if (activeDeleteModalCleanup) activeDeleteModalCleanup(false);
  removeAllListeners();
  allOccasions = [];
  filteredOccasions = [];
  allPersons = [];
  editingId = null;
  mode = "none";
}
