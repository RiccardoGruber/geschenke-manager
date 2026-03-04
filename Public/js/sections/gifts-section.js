/**
 * gifts-section.js
 * -------------------------------------------------------
 * Geschenke & Geschenkideen Verwaltung
 */

import {
  listGifts,
  createGift,
  updateGift,
  deleteGift,
  listPastGifts,
} from "../gift-service.js";
import {
  listGiftIdeas,
  createGiftIdea,
  updateGiftIdea,
  deleteGiftIdea,
} from "../gift-idea-service.js";
import { convertIdeaToGift } from "../gift-convert.js";
import { generateIdeasForPerson } from "../suggestion-service.js";
import { createShareLinkGiftIdeasByPerson } from "../share-service.js";
import { listPersons } from "../person-service.js";
import { listOccasions } from "../occasion-service.js";
import { waitForUserOnce, isAuthed } from "../auth-adapter.js";

// ---------- State ----------

let gifts = [];
let ideas = [];
let pastGifts = [];
let persons = [];
let occasions = [];

let currentTab = "ideas";
let filters = { search: "", person: "all", status: "all", occasion: "all" };
let eventListeners = [];
let editingItem = null;
let formMode = "none"; // 'none' | 'create' | 'edit' | 'convert'
let convertIdeaId = null;
let focusItemId = null;
let activeDeleteModalCleanup = null;
let activeSharePickerCleanup = null;
let activeShareResultCleanup = null;
let generatedSuggestions = [];
let generatedForPersonId = "";
let selectedGeneratedSuggestionIds = new Set();

// Feste Anlässe (immer verfägbar, unabhä¤ngig von DB-Daten)
const FIXED_OCCASIONS = [
  { id: "geburtstag", name: "Geburtstag" },
  { id: "weihnachten", name: "Weihnachten" },
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

function showDeleteConfirmModal(itemLabel = "") {
  if (activeDeleteModalCleanup) activeDeleteModalCleanup(false);

  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "occasion-delete-modal-backdrop";
    backdrop.innerHTML = `
      <div class="occasion-delete-modal" role="dialog" aria-modal="true" aria-labelledby="giftDeleteModalTitle" tabindex="-1">
        <div class="occasion-delete-modal-header">
          <h5 id="giftDeleteModalTitle" class="mb-0">
            <i class="bi bi-exclamation-triangle text-danger"></i> Eintrag löschen
          </h5>
          <button type="button" class="btn-close" aria-label="Schliessen"></button>
        </div>
        <div class="occasion-delete-modal-body">
          <p class="mb-2">Möchtest du diesen Eintrag wirklich löschen?</p>
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

    if (itemLabel) nameEl.textContent = `Eintrag: "${itemLabel}"`;
    else nameEl.remove();

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

function getDeleteFailedMessage(err, label = "Der Eintrag") {
  const raw = String(err?.message || err || "").toLowerCase();
  if (raw.includes("permission") || raw.includes("unauthorized")) {
    return `${label} konnte nicht gelöscht werden. Es fehlen Berechtigungen.`;
  }
  if (raw.includes("kein eingeloggter benutzer") || raw.includes("auth")) {
    return `${label} konnte nicht gelöscht werden. Bitte erneut einloggen.`;
  }
  if (raw.includes("id fehlt")) {
    return `${label} konnte nicht gelöscht werden. Die ID fehlt.`;
  }
  return `${label} konnte nicht gelöscht werden: ${err?.message || err}`;
}

function showPersonSharePickerModal() {
  if (activeSharePickerCleanup) activeSharePickerCleanup(null);

  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "occasion-delete-modal-backdrop";
    backdrop.innerHTML = `
      <div class="occasion-delete-modal" role="dialog" aria-modal="true" aria-labelledby="sharePersonPickerTitle" tabindex="-1">
        <div class="occasion-delete-modal-header">
          <h5 id="sharePersonPickerTitle" class="mb-0">
            <i class="bi bi-people text-primary"></i> Person für Share-Link wählen
          </h5>
          <button type="button" class="btn-close" aria-label="Schliessen"></button>
        </div>
        <div class="occasion-delete-modal-body">
          <p class="text-muted small mb-3">Wähle die Person, deren Geschenkideen geteilt werden sollen.</p>
          <div class="share-person-list">
            ${persons
              .map(
                (p) => `
              <button type="button" class="share-person-option" data-person-id="${p.id}">
                <i class="bi bi-person-circle text-primary"></i>
                <span>${p.name}</span>
              </button>
            `,
              )
              .join("")}
          </div>
        </div>
        <div class="occasion-delete-modal-actions">
          <button type="button" class="btn btn-outline-secondary" data-action="cancel">Abbrechen</button>
        </div>
      </div>
    `;

    const modalEl = backdrop.querySelector(".occasion-delete-modal");
    const closeBtn = backdrop.querySelector(".btn-close");
    const cancelBtn = backdrop.querySelector('[data-action="cancel"]');
    const personBtns = [...backdrop.querySelectorAll(".share-person-option")];

    const finish = (person) => {
      document.removeEventListener("keydown", onKeydown);
      backdrop.removeEventListener("click", onBackdropClick);
      closeBtn.removeEventListener("click", onCancel);
      cancelBtn.removeEventListener("click", onCancel);
      personBtns.forEach((btn) => btn.removeEventListener("click", onPick));
      backdrop.remove();
      document.body.classList.remove("occasion-delete-modal-open");
      if (activeSharePickerCleanup === finish) activeSharePickerCleanup = null;
      resolve(person);
    };

    const onCancel = () => finish(null);
    const onPick = (e) => {
      const pid = e.currentTarget.dataset.personId;
      const person = persons.find((p) => p.id === pid) || null;
      finish(person);
    };
    const onBackdropClick = (e) => {
      if (e.target === backdrop) onCancel();
    };
    const onKeydown = (e) => {
      if (e.key === "Escape") onCancel();
    };

    activeSharePickerCleanup = finish;
    document.body.classList.add("occasion-delete-modal-open");
    document.body.appendChild(backdrop);
    document.addEventListener("keydown", onKeydown);
    backdrop.addEventListener("click", onBackdropClick);
    closeBtn.addEventListener("click", onCancel);
    cancelBtn.addEventListener("click", onCancel);
    personBtns.forEach((btn) => btn.addEventListener("click", onPick));

    modalEl.focus?.();
    personBtns[0]?.focus();
  });
}

function showShareResultModal({ personName, url, copied }) {
  if (activeShareResultCleanup) activeShareResultCleanup();

  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "occasion-delete-modal-backdrop";
    backdrop.innerHTML = `
      <div class="occasion-delete-modal" role="dialog" aria-modal="true" aria-labelledby="shareResultTitle" tabindex="-1">
        <div class="occasion-delete-modal-header">
          <h5 id="shareResultTitle" class="mb-0">
            <i class="bi bi-check-circle text-success"></i> Share-Link erstellt
          </h5>
          <button type="button" class="btn-close" aria-label="Schliessen"></button>
        </div>
        <div class="occasion-delete-modal-body">
          <p class="mb-2">${copied ? "Der Link wurde in die Zwischenablage kopiert." : "Der Link wurde erstellt."}</p>
          <p class="mb-2 text-muted small">Person: ${personName || "Unbekannt"}</p>
          <input type="text" class="form-control form-control-sm" readonly value="${url}">
        </div>
        <div class="occasion-delete-modal-actions">
          <button type="button" class="btn btn-outline-secondary" data-action="copy">
            <i class="bi bi-clipboard"></i> Link kopieren
          </button>
          <button type="button" class="btn btn-primary" data-action="ok">OK</button>
        </div>
      </div>
    `;

    const modalEl = backdrop.querySelector(".occasion-delete-modal");
    const closeBtn = backdrop.querySelector(".btn-close");
    const okBtn = backdrop.querySelector('[data-action="ok"]');
    const copyBtn = backdrop.querySelector('[data-action="copy"]');

    const finish = () => {
      document.removeEventListener("keydown", onKeydown);
      backdrop.removeEventListener("click", onBackdropClick);
      closeBtn.removeEventListener("click", onClose);
      okBtn.removeEventListener("click", onClose);
      copyBtn.removeEventListener("click", onCopy);
      backdrop.remove();
      document.body.classList.remove("occasion-delete-modal-open");
      if (activeShareResultCleanup === finish) activeShareResultCleanup = null;
      resolve();
    };

    const onClose = () => finish();
    const onCopy = async () => {
      try {
        await navigator.clipboard?.writeText(url);
        copyBtn.innerHTML = '<i class="bi bi-check2"></i> Kopiert';
      } catch {
        copyBtn.innerHTML =
          '<i class="bi bi-clipboard-x"></i> Kopieren fehlgeschlagen';
      }
    };
    const onBackdropClick = (e) => {
      if (e.target === backdrop) onClose();
    };
    const onKeydown = (e) => {
      if (e.key === "Escape") onClose();
    };

    activeShareResultCleanup = finish;
    document.body.classList.add("occasion-delete-modal-open");
    document.body.appendChild(backdrop);
    document.addEventListener("keydown", onKeydown);
    backdrop.addEventListener("click", onBackdropClick);
    closeBtn.addEventListener("click", onClose);
    okBtn.addEventListener("click", onClose);
    copyBtn.addEventListener("click", onCopy);

    modalEl.focus?.();
    okBtn.focus();
  });
}

async function handleShareIdeasByPerson() {
  if (currentTab !== "ideas") return;

  let personId = filters.person;
  if (!personId || personId === "all") {
    const selectedPerson = await showPersonSharePickerModal();
    if (!selectedPerson) return;

    personId = selectedPerson.id;
    filters.person = personId;

    const personFilter = document.getElementById("filterPerson");
    if (personFilter) personFilter.value = personId;
    renderList();
    attachListListeners();
  }

  const shareBtn = document.getElementById("sharePersonIdeasBtn");
  const personName = persons.find((p) => p.id === personId)?.name || "";
  const oldText = shareBtn?.innerHTML || "";

  if (shareBtn) {
    shareBtn.disabled = true;
    shareBtn.innerHTML =
      '<i class="bi bi-hourglass-split"></i> Erstelle Link...';
  }

  try {
    const url = await createShareLinkGiftIdeasByPerson({
      personId,
      personName,
    });
    let copied = false;

    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(url);
        copied = true;
      } catch {
        copied = false;
      }
    }

    await showShareResultModal({ personName, url, copied });
  } catch (err) {
    console.error(err);
    alert("Share-Link konnte nicht erstellt werden: " + (err?.message || err));
  } finally {
    if (shareBtn) {
      shareBtn.disabled = false;
      shareBtn.innerHTML = oldText || '<i class="bi bi-share"></i> Teilen';
    }
  }
}

async function handleGenerateIdeasFromSuggestions() {
  if (currentTab !== "ideas") return;

  let personId = filters.person;
  if (!personId || personId === "all") {
    showUiPopup("Bitte zuerst eine Person im Filter auswählen.", "warning");
    return;
  }

  const personName = persons.find((p) => p.id === personId)?.name || "";
  if (!personName) {
    showUiPopup(
      "Die ausgewählte Person konnte nicht gefunden werden.",
      "error",
    );
    return;
  }

  const sourceIdeas = ideas.filter((i) => i.personId === personId);
  const sourceExistingGifts = gifts.filter((g) => g.personId === personId);
  const sourcePastGifts = getPastDisplayGifts().filter(
    (g) => g.personId === personId,
  );

  const generated = generateIdeasForPerson({
    personId,
    personName,
    existingGifts: sourceExistingGifts,
    pastGifts: sourcePastGifts,
    existingIdeas: sourceIdeas,
  });

  generatedSuggestions = generated.map((s, idx) => ({
    ...s,
    _id: buildGeneratedSuggestionId(s, idx),
  }));
  generatedForPersonId = personId;
  selectedGeneratedSuggestionIds = new Set(
    generatedSuggestions.map((s) => s._id),
  );

  renderList();
  attachListListeners();
  if (!generatedSuggestions.length) {
    showUiPopup(
      "Es konnten keine neuen Vorschläge generiert werden.",
      "warning",
    );
    return;
  }
  showUiPopup(
    `${generatedSuggestions.length} Ideen wurden generiert.`,
    "success",
  );
}

async function handleAdoptGeneratedSuggestions() {
  if (currentTab !== "ideas" || !generatedSuggestions.length) return;
  const selected = generatedSuggestions.filter((s) =>
    selectedGeneratedSuggestionIds.has(s._id),
  );
  if (!selected.length) {
    showUiPopup("Bitte wähle mindestens einen Vorschlag aus.", "warning");
    return;
  }

  const person = persons.find((p) => p.id === generatedForPersonId);
  if (!person) {
    showUiPopup("Die Person zu den Vorschlägen wurde nicht gefunden.", "error");
    return;
  }

  const existingContent = new Set(
    ideas
      .filter((i) => i.personId === generatedForPersonId)
      .map((i) =>
        String(i.content || "")
          .trim()
          .toLowerCase(),
      ),
  );

  let adoptedCount = 0;
  for (const suggestion of selected) {
    const normalizedContent = String(suggestion.content || "")
      .trim()
      .toLowerCase();
    if (normalizedContent && existingContent.has(normalizedContent)) continue;

    await createGiftIdea({
      personId: generatedForPersonId,
      personName: person.name || "",
      occasionId: suggestion.occasionId || "",
      occasionName: suggestion.occasionName || "",
      giftName: suggestion.title || "",
      type: suggestion.type || "text",
      content: suggestion.content || suggestion.title || "",
      note: "",
      date: "",
      status: "offen",
    });

    if (normalizedContent) existingContent.add(normalizedContent);
    adoptedCount += 1;
  }

  await loadData();
  clearGeneratedSuggestions();
  renderList();
  attachListListeners();

  if (!adoptedCount) {
    showUiPopup("Keine neuen Ideen übernommen (bereits vorhanden).", "warning");
    return;
  }
  showUiPopup(`${adoptedCount} Ideen wurden übernommen.`, "success");
}

/**
 * Entfernt aus DB-Anlässen alle, die einem festen Anlass entsprechen oder doppelt vorkommen.
 */
function getDeduplicatedOccasions() {
  const fixedNames = FIXED_OCCASIONS.map((o) => o.name.toLowerCase());
  const seen = new Set();

  return occasions.filter((occ) => {
    const nameLower = (occ.name || "").toLowerCase().trim();
    if (fixedNames.includes(nameLower)) return false;
    if (seen.has(nameLower)) return false;
    seen.add(nameLower);
    return true;
  });
}

function showLoading(show) {
  document.getElementById("giftsLoading")?.classList.toggle("d-none", !show);
}

function isHttpUrl(value) {
  const url = String(value || "").trim();
  return /^https?:\/\/\S+$/i.test(url);
}

function normalizeHttpUrl(value) {
  return String(value || "").trim();
}

function parseGiftNoteMedia(noteValue = "") {
  const lines = String(noteValue || "").split(/\r?\n/);
  let imageUrl = "";
  let linkUrl = "";
  const cleanLines = [];

  lines.forEach((line) => {
    const imageMatch = /^\[Bild\]\s+(https?:\/\/\S+)$/i.exec(line.trim());
    if (imageMatch) {
      imageUrl = imageMatch[1];
      return;
    }
    const linkMatch = /^\[Link\]\s+(https?:\/\/\S+)$/i.exec(line.trim());
    if (linkMatch) {
      linkUrl = linkMatch[1];
      return;
    }
    cleanLines.push(line);
  });

  return {
    note: cleanLines.join("\n").trim(),
    imageUrl,
    linkUrl,
  };
}

function buildGiftNoteWithMedia(noteValue = "", imageUrl = "", linkUrl = "") {
  const parsed = parseGiftNoteMedia(noteValue);
  const lines = [];

  if (parsed.note) lines.push(parsed.note);
  if (imageUrl) lines.push(`[Bild] ${imageUrl}`);
  if (linkUrl) lines.push(`[Link] ${linkUrl}`);

  return lines.join("\n");
}

function getIdeaMedia(item = {}) {
  const imageUrl =
    item.imageUrl || (item.type === "image" ? item.content : "") || "";
  const linkUrl =
    item.linkUrl || (item.type === "link" ? item.content : "") || "";
  return { imageUrl, linkUrl };
}

function showUiPopup(message, type = "info") {
  const containerId = "giftsUiPopupContainer";
  let container = document.getElementById(containerId);

  if (!container) {
    container = document.createElement("div");
    container.id = containerId;
    container.style.position = "fixed";
    container.style.top = "1rem";
    container.style.right = "1rem";
    container.style.zIndex = "2000";
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.gap = "0.5rem";
    container.style.maxWidth = "min(92vw, 380px)";
    document.body.appendChild(container);
  }

  const el = document.createElement("div");
  const mapped =
    type === "error"
      ? "danger"
      : type === "warning"
        ? "warning"
        : type === "success"
          ? "success"
          : "primary";
  el.className = `alert alert-${mapped} shadow-sm py-2 px-3 mb-0`;
  el.setAttribute("role", "alert");
  el.textContent = message;
  container.appendChild(el);

  setTimeout(() => {
    el.remove();
    if (!container.children.length) container.remove();
  }, 2400);
}

function clearGeneratedSuggestions() {
  generatedSuggestions = [];
  generatedForPersonId = "";
  selectedGeneratedSuggestionIds = new Set();
}

function updateGeneratedAdoptButton() {
  const adoptBtn = document.getElementById("adoptGeneratedBtn");
  if (!adoptBtn) return;
  const selectedCount = selectedGeneratedSuggestionIds.size;
  adoptBtn.disabled = selectedCount === 0;
  adoptBtn.innerHTML = `<i class="bi bi-download"></i> Ausgewählte übernehmen (${selectedCount})`;
}

function buildGeneratedSuggestionId(suggestion, idx) {
  const base = String(suggestion?.content || suggestion?.title || "idee")
    .replace(/\s+/g, "-")
    .toLowerCase();
  return `gs-${Date.now()}-${idx}-${base.slice(0, 24)}`;
}

function renderGeneratedSuggestionsPanel() {
  if (currentTab !== "ideas" || !generatedSuggestions.length) return "";

  const personName =
    persons.find((p) => p.id === generatedForPersonId)?.name || "Unbekannt";
  const selectedCount = generatedSuggestions.filter((s) =>
    selectedGeneratedSuggestionIds.has(s._id),
  ).length;

  const rows = generatedSuggestions
    .map((s) => {
      const checked = selectedGeneratedSuggestionIds.has(s._id)
        ? "checked"
        : "";
      return `
      <div class="border rounded-3 p-2 bg-white d-flex gap-2 align-items-start">
        <input class="form-check-input mt-1 generated-suggestion-check" type="checkbox" data-suggestion-id="${s._id}" ${checked}>
        <div class="flex-grow-1">
          <div class="fw-semibold">${s.title || s.content || "Vorschlag"}</div>
          <div class="small text-muted">Aus bekannten Geschenken generiert.</div>
        </div>
      </div>
    `;
    })
    .join("");

  return `
    <div class="card mb-3">
      <div class="card-header d-flex justify-content-between align-items-center">
        <div>
          <i class="bi bi-stars text-warning"></i>
          Generierte Ideen für <strong>${personName}</strong>
        </div>
        <span class="badge bg-light text-dark">${generatedSuggestions.length}</span>
      </div>
      <div class="card-body">
        <div class="d-flex gap-2 flex-wrap mb-3">
          <button class="btn btn-sm btn-outline-secondary" id="selectAllGeneratedBtn">
            <i class="bi bi-check2-square"></i> Alle auswählen
          </button>
          <button class="btn btn-sm btn-success" id="adoptGeneratedBtn" ${selectedCount ? "" : "disabled"}>
            <i class="bi bi-download"></i> Ausgewählte übernehmen (${selectedCount})
          </button>
          <button class="btn btn-sm btn-outline-danger" id="clearGeneratedBtn">
            <i class="bi bi-x-circle"></i> Verwerfen
          </button>
        </div>
        <div class="vstack gap-2">
          ${rows}
        </div>
      </div>
    </div>
  `;
}

function parseDateOnly(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setHours(0, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDisplayDate(value) {
  const d = parseDateOnly(value);
  if (!d) return "-";
  return d.toLocaleDateString("de-DE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function isDateInPast(value) {
  const d = parseDateOnly(value);
  if (!d) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

function normalizeIdeaStatus(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "erledigt") return "besorgt";
  if (normalized === "besorgt") return "besorgt";
  return "offen";
}

function getPastDisplayGifts() {
  const plannedByRule = gifts.filter((gift) => isDateInPast(gift?.date));
  const explicitPastByDate = pastGifts.filter((gift) =>
    isDateInPast(gift?.date),
  );

  const map = new Map();
  [...explicitPastByDate, ...plannedByRule].forEach((gift) => {
    if (!gift?.id) return;
    if (!map.has(gift.id)) map.set(gift.id, gift);
  });

  return [...map.values()].sort((a, b) =>
    String(b?.date || "").localeCompare(String(a?.date || "")),
  );
}

function getPlannedDisplayGifts() {
  return gifts.filter((gift) => !isDateInPast(gift?.date));
}

function getDisplayItemsForTab(tab = currentTab) {
  if (tab === "gifts") return getPlannedDisplayGifts();
  if (tab === "ideas") return ideas;
  return getPastDisplayGifts();
}

async function loadData() {
  showLoading(true);
  try {
    const [g, i, pg, p, o] = await Promise.all([
      listGifts().catch(() => []),
      listGiftIdeas().catch(() => []),
      listPastGifts().catch(() => []),
      listPersons().catch(() => []),
      listOccasions().catch(() => []),
    ]);
    gifts = g || [];
    ideas = i || [];
    pastGifts = pg || [];
    persons = p || [];
    occasions = o || [];
  } finally {
    showLoading(false);
  }
}

function applyFilters(src) {
  return src.filter((item) => {
    if (filters.search) {
      const fields = [
        item.personName,
        item.occasionName || "",
        item.giftName || "",
        currentTab === "ideas" ? item.content : item.note,
      ];
      if (
        !fields.join(" ").toLowerCase().includes(filters.search.toLowerCase())
      )
        return false;
    }
    if (filters.person !== "all" && item.personId !== filters.person)
      return false;
    if (filters.occasion !== "all" && item.occasionId !== filters.occasion)
      return false;
    if (filters.status !== "all") {
      if (currentTab === "ideas") {
        if (normalizeIdeaStatus(item.status) !== filters.status) return false;
      } else if (item.status !== filters.status) {
        return false;
      }
    }
    return true;
  });
}

function resolveOccasionName(occasionId) {
  if (!occasionId) return "";
  const fixed = FIXED_OCCASIONS.find((o) => o.id === occasionId);
  const custom = occasions.find((o) => o.id === occasionId);
  return (fixed || custom)?.name || "";
}

// ---------- Rendering ----------

function renderFilters(container) {
  const statuses =
    currentTab === "ideas"
      ? ["all", "offen", "besorgt"]
      : ["all", "offen", "besorgt", "ueberreicht"];

  const customOccasions = getDeduplicatedOccasions();

  container.innerHTML = `
    <div class="d-flex gap-3 align-items-center flex-wrap mb-3">
      <div style="flex: 1; min-width: 250px;">
        <input type="text" id="giftsSearch" class="form-control"
               placeholder="Suche nach Name, Person, Anlass..."
               value="${filters.search || ""}">
      </div>

      <div>
        <select id="filterPerson" class="form-select">
          <option value="all" ${filters.person === "all" ? "selected" : ""}>Alle Personen</option>
          ${persons
            .map(
              (p) => `
            <option value="${p.id}" ${filters.person === p.id ? "selected" : ""}>${p.name}</option>
          `,
            )
            .join("")}
        </select>
      </div>

      <div>
        <select id="filterOccasion" class="form-select">
          <option value="all" ${filters.occasion === "all" ? "selected" : ""}>Alle Anlässe</option>
          <optgroup label="Feste Anlässe">
            ${FIXED_OCCASIONS.map(
              (o) => `
              <option value="${o.id}" ${filters.occasion === o.id ? "selected" : ""}>${o.name}</option>
            `,
            ).join("")}
          </optgroup>
          ${
            customOccasions.length
              ? `
            <optgroup label="Eigene Anlässe">
              ${customOccasions
                .map(
                  (o) => `
                <option value="${o.id}" ${filters.occasion === o.id ? "selected" : ""}>${o.name}</option>
              `,
                )
                .join("")}
            </optgroup>
          `
              : ""
          }
        </select>
      </div>

      <div>
        <select id="filterStatus" class="form-select">
          ${statuses
            .map((s) => {
              let label =
                s === "all"
                  ? "Alle Status"
                  : s.charAt(0).toUpperCase() + s.slice(1);
              if (currentTab === "ideas") {
                label =
                  s === "all"
                    ? "Alle Ideen"
                    : s.charAt(0).toUpperCase() + s.slice(1);
              }
              return `<option value="${s}" ${filters.status === s ? "selected" : ""}>${label}</option>`;
            })
            .join("")}
        </select>
      </div>

      <div class="ms-auto">
        ${
          currentTab === "ideas"
            ? `
          <button class="btn btn-outline-warning me-2" id="generateIdeasBtn">
            <i class="bi bi-stars"></i> Ideen generieren
          </button>
          <button class="btn btn-outline-primary me-2" id="sharePersonIdeasBtn">
            <i class="bi bi-share"></i> Teilen
          </button>
        `
            : ""
        }
        ${
          currentTab !== "past"
            ? `
          <button class="btn btn-primary" id="addItemBtn">
            <i class="bi bi-plus-circle"></i> Neu
          </button>
        `
            : ""
        }
      </div>
    </div>
  `;
}

function renderList() {
  const listDiv = document.getElementById("listContainer");
  const source = getDisplayItemsForTab(currentTab);
  const src = applyFilters(source);
  const suggestionsPanel = renderGeneratedSuggestionsPanel();
  const sectionTitle =
    currentTab === "gifts"
      ? "Geschenke"
      : currentTab === "ideas"
        ? "Geschenkideen"
        : "Vergangene Geschenke";

  if (!src.length) {
    listDiv.innerHTML = `
      ${suggestionsPanel}
      <div class="text-center py-5 text-muted">
        <i class="bi bi-inbox" style="font-size: 3rem;"></i>
        <h5 class="mt-3">Keine ${sectionTitle} gefunden</h5>
        <p>${currentTab === "past" ? "Keine Historien-Einträge vorhanden." : `Klicke auf "Neu" um ${currentTab === "gifts" ? "ein Geschenk" : "eine Geschenkidee"} hinzuzufügen.`}</p>
      </div>
    `;
    return;
  }

  const cards = src
    .map((item) =>
      currentTab === "gifts"
        ? renderGiftCard(item)
        : currentTab === "ideas"
          ? renderIdeaCard(item)
          : renderPastGiftCard(item),
    )
    .join("");

  listDiv.innerHTML = `
    ${suggestionsPanel}
    <div class="row g-3">${cards}</div>
  `;

  if (focusItemId) {
    const target = listDiv.querySelector(`[data-id="${focusItemId}"]`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.classList.add("border", "border-3", "border-primary");
    }
    focusItemId = null;
  }
}
function renderGiftCard(item) {
  const media = parseGiftNoteMedia(item.note || "");
  const statusBadge =
    item.status === "ueberreicht"
      ? "success"
      : item.status === "besorgt"
        ? "info"
        : "warning";
  const statusText =
    item.status === "ueberreicht"
      ? "Überreicht"
      : item.status === "besorgt"
        ? "Besorgt"
        : "Offen";

  return `
    <div class="col-12 col-md-6 col-lg-4">
      <div class="card h-100 gift-card" data-id="${item.id}">
        <div class="card-body">
          <h2 class="gift-primary-title">
            <i class="bi bi-gift-fill text-primary"></i>
            ${item.giftName || item.occasionName || "Geschenk"}
          </h2>

          <div class="mb-3">
            <span class="badge bg-${statusBadge}">${statusText}</span>
          </div>

          <div class="gift-meta-list">
            <div class="gift-meta-item">
              <i class="bi bi-calendar-event text-muted"></i>
              <span class="fw-semibold">Datum:</span>
              <span>${formatDisplayDate(item.date)}</span>
            </div>
            <div class="gift-meta-item">
              <i class="bi bi-person text-muted"></i>
              <span class="fw-semibold">Person:</span>
              <span>${item.personName}</span>
            </div>
            ${
              item.occasionName
                ? `
              <div class="gift-meta-item">
                <i class="bi bi-star text-muted"></i>
                <span class="fw-semibold">Anlass:</span>
                <span>${item.occasionName}</span>
              </div>
            `
                : ""
            }
            ${
              media.note
                ? `
              <div class="gift-meta-item">
                <i class="bi bi-chat-left-text text-muted"></i>
                <span class="fw-semibold">Notiz:</span>
                <span class="text-muted">${media.note}</span>
              </div>
            `
                : ""
            }
            ${
              media.linkUrl
                ? `
              <div class="gift-meta-item">
                <i class="bi bi-link-45deg text-muted"></i>
                <span class="fw-semibold">Link:</span>
                <a href="${media.linkUrl}" target="_blank" class="gift-link text-truncate">${media.linkUrl}</a>
              </div>
            `
                : ""
            }
            ${
              media.imageUrl
                ? `
              <div class="gift-meta-item">
                <i class="bi bi-image text-muted"></i>
                <span class="fw-semibold">Bild:</span>
                <a href="${media.imageUrl}" target="_blank" class="gift-link text-truncate">Bild öffnen</a>
              </div>
            `
                : ""
            }
            ${
              item.sourceIdeaId
                ? `
              <div class="gift-meta-item">
                <small class="badge bg-light text-dark">
                  <i class="bi bi-lightbulb"></i> Konvertiert aus Idee
                </small>
              </div>
            `
                : ""
            }
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
  const ideaStatus = normalizeIdeaStatus(item.status);
  const statusBadge = ideaStatus === "besorgt" ? "info" : "warning";
  const statusText = ideaStatus === "besorgt" ? "Besorgt" : "Offen";
  const cardTitle = item.giftName || item.occasionName || "Geschenkidee";
  const detailsText = item.note || (!item.giftName ? item.content : "");
  const media = getIdeaMedia(item);

  let contentPreview = "";
  if (media.imageUrl) {
    contentPreview = `
      <div class="text-center gift-image-preview">
        <a href="${media.imageUrl}" target="_blank" class="gift-link d-inline-block">
          <img src="${media.imageUrl}" class="img-fluid rounded" style="max-height: 150px; object-fit: cover;" alt="Geschenkidee">
        </a>
      </div>
    `;
  } else if (media.linkUrl) {
    contentPreview = `
      <a href="${media.linkUrl}" target="_blank" class="d-flex align-items-center text-decoration-none gift-link">
        <i class="bi bi-link-45deg me-2"></i>
        <span class="text-truncate">${media.linkUrl}</span>
      </a>
    `;
  } else if (detailsText) {
    contentPreview = `
      <div class="gift-meta-item gift-idea-extra-item">
        <i class="bi bi-chat-left-text text-muted"></i>
        <span class="fw-semibold">Info:</span>
        <span class="gift-idea-note">${detailsText}</span>
      </div>
    `;
  }

  return `
    <div class="col-12 col-md-6 col-lg-4">
      <div class="card h-100 gift-idea-card" data-id="${item.id}">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start mb-2">
            <h2 class="gift-primary-title mb-0">
              <i class="bi bi-lightbulb-fill text-warning"></i>
              ${cardTitle}
            </h2>
            <span class="badge bg-${statusBadge}">${statusText}</span>
          </div>

          <div class="gift-meta-list mb-3">
            <div class="gift-meta-item gift-idea-person-row">
              <i class="bi bi-person text-muted"></i>
              <span class="fw-semibold">Person:</span>
              <span class="gift-idea-person">${item.personName || "-"}</span>
            </div>
            ${
              item.occasionName && item.occasionName !== cardTitle
                ? `
              <div class="gift-meta-item">
                <i class="bi bi-star text-muted"></i>
                <span class="fw-semibold">Anlass:</span>
                <span>${item.occasionName}</span>
              </div>
            `
                : ""
            }
            ${
              item.date
                ? `
              <div class="gift-meta-item">
                <i class="bi bi-calendar-event text-muted"></i>
                <span class="fw-semibold">Datum:</span>
                <span>${formatDisplayDate(item.date)}</span>
              </div>
              ${
                isDateInPast(item.date)
                  ? `
                <div class="gift-meta-item text-warning">
                  <i class="bi bi-exclamation-triangle"></i>
                  <span>Die Idee liegt in der Vergangenheit.</span>
                </div>
              `
                  : ""
              }
            `
                : ""
            }
            ${contentPreview ? `<div class="gift-idea-content">${contentPreview}</div>` : ""}
          </div>

          <div class="d-flex gap-2">
            <button class="btn btn-sm btn-outline-primary edit-btn flex-grow-1">
              <i class="bi bi-pencil"></i> Bearbeiten
            </button>
            <button class="btn btn-sm btn-outline-danger delete-btn">
              <i class="bi bi-trash"></i>
            </button>
            <button class="btn btn-sm btn-success convert-btn">
              <i class="bi bi-arrow-right-circle"></i> Konvertieren
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderPastGiftCard(item) {
  const statusBadge =
    item.status === "ueberreicht"
      ? "success"
      : item.status === "besorgt"
        ? "info"
        : "warning";
  const statusText =
    item.status === "ueberreicht"
      ? "Überreicht"
      : item.status === "besorgt"
        ? "Besorgt"
        : "Offen";
  const title = item.giftName || item.occasionName || "Vergangenes Geschenk";

  return `
    <div class="col-12 col-md-6 col-lg-4">
      <div class="card h-100 gift-card" data-id="${item.id}">
        <div class="card-body">
          <h2 class="gift-primary-title">
            <i class="bi bi-clock-history text-success"></i>
            ${title}
          </h2>

          <div class="mb-3">
            <span class="badge bg-${statusBadge}">${statusText}</span>
            <span class="badge bg-light text-dark ms-2">Historie</span>
          </div>

          <div class="gift-meta-list">
            <div class="gift-meta-item">
              <i class="bi bi-calendar-event text-muted"></i>
              <span class="fw-semibold">Datum:</span>
              <span>${formatDisplayDate(item.date)}</span>
            </div>
            <div class="gift-meta-item">
              <i class="bi bi-person text-muted"></i>
              <span class="fw-semibold">Person:</span>
              <span>${item.personName || "-"}</span>
            </div>
            ${
              item.note
                ? `
              <div class="gift-meta-item">
                <i class="bi bi-chat-left-text text-muted"></i>
                <span class="fw-semibold">Notiz:</span>
                <span class="text-muted">${item.note}</span>
              </div>
            `
                : ""
            }
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
function renderForm() {
  const formDiv = document.getElementById("formContainer");

  if (formMode === "none") {
    formDiv.innerHTML = "";
    formDiv.classList.add("d-none");
    return;
  }

  formDiv.classList.remove("d-none");

  if (formMode === "convert") {
    renderConvertForm(formDiv);
    return;
  }

  renderEntityForm(formDiv);
}

function renderConvertForm(formDiv) {
  const idea = ideas.find((i) => i.id === convertIdeaId);
  if (!idea) {
    formMode = "none";
    renderForm();
    return;
  }
  const defaultGiftName = (idea.giftName || idea.content || "").trim();
  const defaultConvertDate = idea.date || "";

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
                      placeholder="Optional: Zusätzliche Informationen und ToDo´s zum Geschenk"></textarea>
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

  const dateInput = document.getElementById("convertDate");
  const dateGroup = dateInput.closest(".input-group");
  dateGroup.style.cursor = "pointer";
  dateGroup.addEventListener("click", () => dateInput.showPicker?.());
}

function renderEntityForm(formDiv) {
  const isEdit = formMode === "edit";
  const item = isEdit
    ? getDisplayItemsForTab(currentTab).find(
        (entry) => entry.id === editingItem,
      )
    : null;
  const title = `${isEdit ? "Bearbeiten" : "Neu"}: ${
    currentTab === "gifts"
      ? "Geschenk"
      : currentTab === "past"
        ? "Vergangenes Geschenk"
        : "Geschenkidee"
  }`;
  const customOccasions = getDeduplicatedOccasions();

  formDiv.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h5 class="mb-0">
          <i class="bi bi-${isEdit ? "pencil" : "plus-circle"}"></i> ${title}
        </h5>
      </div>
      <div class="card-body">
        <form id="entityForm">
          <div class="row">
            <div class="col-md-6 mb-3">
              <label class="form-label">Person <span class="text-danger">*</span></label>
              <select id="formPerson" class="form-select" required>
                <option value="">Bitte wählen...</option>
                ${persons
                  .map(
                    (p) => `
                  <option value="${p.id}" ${item && item.personId === p.id ? "selected" : ""}>${p.name}</option>
                `,
                  )
                  .join("")}
              </select>
            </div>

            <div class="col-md-6 mb-3">
              <label class="form-label">Anlass</label>
              <select id="formOccasion" class="form-select">
                <option value="">Kein spezifischer Anlass</option>
                <optgroup label="Feste Anlässe">
                  ${FIXED_OCCASIONS.map(
                    (o) => `
                    <option value="${o.id}" ${item && item.occasionId === o.id ? "selected" : ""}>${o.name}</option>
                  `,
                  ).join("")}
                </optgroup>
                ${
                  customOccasions.length
                    ? `
                  <optgroup label="Eigene Anlässe">
                    ${customOccasions
                      .map(
                        (o) => `
                      <option value="${o.id}" ${item && item.occasionId === o.id ? "selected" : ""}>${o.name}</option>
                    `,
                      )
                      .join("")}
                  </optgroup>
                `
                    : ""
                }
                <option value="__custom__"> + Individueller Anlass...</option>
              </select>
            </div>

            <div class="col-12 mb-3 d-none" id="customOccasionDiv">
              <label class="form-label">Individueller Anlass</label>
              <input type="text" id="formCustomOccasion" class="form-control"
                     placeholder="z.B. Hochzeitstag, Firmenjubiläum">
            </div>
          </div>

          ${currentTab === "ideas" ? renderIdeaFormFields(item) : renderGiftFormFields(item)}

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

  // Custom Occasion Toggle
  const occasionSelect = document.getElementById("formOccasion");
  const customDiv = document.getElementById("customOccasionDiv");
  if (occasionSelect) {
    occasionSelect.addEventListener("change", () => {
      const isCustom = occasionSelect.value === "__custom__";
      customDiv.classList.toggle("d-none", !isCustom);
      document.getElementById("formCustomOccasion").required = isCustom;
    });
  }

  // Datepicker für Geschenke
  if (currentTab === "gifts") {
    const dateInput = document.getElementById("formDate");
    const dateGroup = dateInput?.closest(".input-group");
    if (dateGroup) {
      dateGroup.style.cursor = "pointer";
      dateGroup.addEventListener("click", () => dateInput.showPicker?.());
    }
  } else if (currentTab === "ideas") {
    const ideaDateInput = document.getElementById("formIdeaDate");
    const ideaDateGroup = ideaDateInput?.closest(".input-group");
    if (ideaDateGroup) {
      ideaDateGroup.style.cursor = "pointer";
      ideaDateGroup.addEventListener("click", () =>
        ideaDateInput.showPicker?.(),
      );
    }

    const ideaDateWarning = document.getElementById("formIdeaDateWarning");
    const updateIdeaDateWarning = () => {
      if (!ideaDateWarning) return;
      ideaDateWarning.classList.toggle(
        "d-none",
        !isDateInPast(ideaDateInput?.value),
      );
    };
    updateIdeaDateWarning();
    ideaDateInput?.addEventListener("input", updateIdeaDateWarning);
    ideaDateInput?.addEventListener("change", updateIdeaDateWarning);
  }
}

function renderIdeaFormFields(item) {
  const media = getIdeaMedia(item || {});
  const isTextIdea = item
    ? item.type !== "link" && item.type !== "image"
    : true;
  const ideaGiftName = item
    ? item.giftName || (isTextIdea && !item.note ? item.content : "") || ""
    : "";
  const ideaDetails = item
    ? item.note || (isTextIdea && !item.giftName ? item.content : "") || ""
    : "";
  const ideaDate = item?.date || "";

  return `
    <div class="mb-3">
      <label class="form-label">Geschenkname</label>
      <input type="text" id="formGiftName" class="form-control"
             value="${ideaGiftName}"
             placeholder="z.B. Gutschein, Buch, Konzertkarten">
    </div>

    <div class="mb-3">
      <label class="form-label">Notiz</label>
      <textarea id="formNote" class="form-control" rows="3"
                placeholder="ToDos und weitere Infos hier reinschreiben">${ideaDetails}</textarea>
    </div>

    <div class="mb-3">
      <label class="form-label">Datum (optional)</label>
      <div class="input-group">
        <input type="date" id="formIdeaDate" class="form-control"
               value="${ideaDate}" style="cursor: pointer;">
        <span class="input-group-text"><i class="bi bi-calendar3"></i></span>
      </div>
      <small class="text-muted">Wird beim Konvertieren als Geschenkdatum vorgeschlagen.</small>
      <small id="formIdeaDateWarning" class="text-warning d-block mt-1 ${isDateInPast(ideaDate) ? "" : "d-none"}">
        <i class="bi bi-exclamation-triangle"></i> Die Idee liegt in der Vergangenheit.
      </small>
    </div>

    <div class="mb-3">
      <label class="form-label">Medien</label>
      <div class="input-group mt-2">
        <input type="url" id="formImageUrl" class="form-control" placeholder="Bild-URL (https://...)" value="${media.imageUrl || ""}">
        <button type="button" class="btn btn-outline-secondary" id="mediaOpenImageBtn">
          <i class="bi bi-box-arrow-up-right"></i> Bild öffnen
        </button>
      </div>
      <div class="input-group mt-2">
        <input type="url" id="formLinkUrl" class="form-control" placeholder="Link-URL (https://...)" value="${media.linkUrl || ""}">
        <button type="button" class="btn btn-outline-secondary" id="mediaCopyLinkBtn">
          <i class="bi bi-clipboard"></i> Link kopieren
        </button>
      </div>
    </div>
    <div class="mb-3">
      <label class="form-label">Status</label>
      <select id="formStatus" class="form-select">
        <option value="offen"    ${normalizeIdeaStatus(item?.status) === "offen" ? "selected" : ""}>Offen</option>
        <option value="besorgt"  ${normalizeIdeaStatus(item?.status) === "besorgt" ? "selected" : ""}>Besorgt</option>
      </select>
    </div>
  `;
}
function renderGiftFormFields(item) {
  const media = parseGiftNoteMedia(item?.note || "");
  const requiresGiftName = currentTab !== "past";

  return `
    <div class="mb-3">
      <label class="form-label">Name des Geschenks ${requiresGiftName ? '<span class="text-danger">*</span>' : ""}</label>
      <input type="text" id="formGiftName" class="form-control"
             value="${item ? item.giftName || "" : ""}" ${requiresGiftName ? "required" : ""}
             placeholder="z.B. Amazon Gutschein, Buch 'Die Säulen der Erde'">
    </div>

    <div class="mb-3">
      <label class="form-label">Datum <span class="text-danger">*</span></label>
      <div class="input-group">
        <input type="date" id="formDate" class="form-control"
               value="${item ? item.date : ""}" required style="cursor: pointer;">
        <span class="input-group-text"><i class="bi bi-calendar3"></i></span>
      </div>
    </div>

    <div class="mb-3">
      <label class="form-label">Notiz</label>
      <textarea id="formNote" class="form-control" rows="3"
                placeholder="ToDos und weitere Infos hier reinschreiben">${media.note || ""}</textarea>
    </div>

    <div class="mb-3">
      <label class="form-label">Medien</label>
      <div class="input-group mt-2">
        <input type="url" id="formImageUrl" class="form-control" placeholder="Bild-URL (https://...)" value="${media.imageUrl || ""}">
        <button type="button" class="btn btn-outline-secondary" id="mediaOpenImageBtn">
          <i class="bi bi-box-arrow-up-right"></i> Bild öffnen
        </button>
      </div>
      <div class="input-group mt-2">
        <input type="url" id="formLinkUrl" class="form-control" placeholder="Link-URL (https://...)" value="${media.linkUrl || ""}">
        <button type="button" class="btn btn-outline-secondary" id="mediaCopyLinkBtn">
          <i class="bi bi-clipboard"></i> Link kopieren
        </button>
      </div>
    </div>

    <div class="mb-3">
      <label class="form-label">Status</label>
      <select id="formStatus" class="form-select">
        <option value="offen"      ${item && item.status === "offen" ? "selected" : ""}>Offen</option>
        <option value="besorgt"    ${item && item.status === "besorgt" ? "selected" : ""}>Besorgt</option>
        <option value="ueberreicht" ${item && item.status === "ueberreicht" ? "selected" : ""}>Überreicht</option>
      </select>
    </div>
  `;
}
// ---------- Event Handlers ----------

function attachEventListeners(ctx) {
  removeAllListeners();

  // Tabs
  document.querySelectorAll("#giftsTabs .nav-link").forEach((tab) => {
    addListener(tab, "click", (e) => {
      e.preventDefault();
      currentTab = tab.dataset.tab;
      filters = { search: "", person: "all", status: "all", occasion: "all" };
      editingItem = null;
      formMode = "none";
      convertIdeaId = null;
      clearGeneratedSuggestions();

      document
        .querySelectorAll("#giftsTabs .nav-link")
        .forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");

      renderFilters(document.getElementById("tabFilters"));
      renderList();
      renderForm();
      attachEventListeners(ctx);
    });
  });

  // Filter-Controls
  addListener(document.getElementById("giftsSearch"), "input", (e) => {
    filters.search = e.target.value;
    renderList();
    attachListListeners();
  });

  addListener(document.getElementById("filterPerson"), "change", (e) => {
    if (generatedForPersonId && generatedForPersonId !== e.target.value) {
      clearGeneratedSuggestions();
    }
    filters.person = e.target.value;
    renderList();
    attachListListeners();
  });

  addListener(document.getElementById("filterOccasion"), "change", (e) => {
    filters.occasion = e.target.value;
    renderList();
    attachListListeners();
  });

  addListener(document.getElementById("filterStatus"), "change", (e) => {
    filters.status = e.target.value;
    renderList();
    attachListListeners();
  });

  // "Neu"-Button
  addListener(document.getElementById("addItemBtn"), "click", (e) => {
    e.preventDefault();
    formMode = "create";
    editingItem = null;
    renderForm();
    window.scrollTo(0, 0);
    attachEventListeners(ctx);
  });

  addListener(
    document.getElementById("sharePersonIdeasBtn"),
    "click",
    async (e) => {
      e.preventDefault();
      await handleShareIdeasByPerson();
    },
  );

  addListener(
    document.getElementById("generateIdeasBtn"),
    "click",
    async (e) => {
      e.preventDefault();
      await handleGenerateIdeasFromSuggestions();
    },
  );

  // Formular
  const formEl = document.getElementById("entityForm");
  addListener(formEl, "submit", (e) => handleFormSubmit(e, ctx));

  const convertForm = document.getElementById("convertForm");
  addListener(convertForm, "submit", (e) => handleConvertSubmit(e, ctx));

  addListener(document.getElementById("cancelBtn"), "click", () => {
    formMode = "none";
    editingItem = null;
    convertIdeaId = null;
    renderForm();
    attachEventListeners(ctx);
  });

  addListener(document.getElementById("deleteBtn"), "click", () =>
    handleDelete(ctx),
  );
  attachMediaFieldListeners();

  attachListListeners();
}

function attachMediaFieldListeners() {
  const openImageBtn = document.getElementById("mediaOpenImageBtn");
  const copyLinkBtn = document.getElementById("mediaCopyLinkBtn");
  const imageInput = document.getElementById("formImageUrl");
  const linkInput = document.getElementById("formLinkUrl");

  addListener(openImageBtn, "click", () => {
    const url = imageInput?.value?.trim() || "";
    if (!isHttpUrl(url)) {
      showUiPopup(
        "Bitte eine gültige Bild-URL (http/https) eingeben.",
        "warning",
      );
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
    showUiPopup("Bild wurde in einem neuen Tab geöffnet.", "success");
  });

  addListener(copyLinkBtn, "click", async () => {
    const url = linkInput?.value?.trim() || "";
    if (!isHttpUrl(url)) {
      showUiPopup(
        "Bitte eine gültige Link-URL (http/https) eingeben.",
        "warning",
      );
      return;
    }
    try {
      await navigator.clipboard?.writeText(url);
      copyLinkBtn.innerHTML = '<i class="bi bi-check2"></i> Kopiert';
      showUiPopup("Link wurde in die Zwischenablage kopiert.", "success");
      setTimeout(() => {
        copyLinkBtn.innerHTML = '<i class="bi bi-clipboard"></i> Link kopieren';
      }, 1200);
    } catch {
      showUiPopup("Kopieren fehlgeschlagen.", "error");
    }
  });
}

async function handleFormSubmit(e, ctx) {
  e.preventDefault();

  const user = await waitForUserOnce();
  if (!user) {
    window.location.href = "./login.html";
    return;
  }

  const formEl = document.getElementById("entityForm");
  const btn = formEl.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Speichere...';

  try {
    let movedPastGiftToActive = false;
    const personId = document.getElementById("formPerson").value;
    const personName = persons.find((p) => p.id === personId)?.name || "";

    let occasionId = document.getElementById("formOccasion").value || null;
    let occasionName = "";

    if (occasionId === "__custom__") {
      occasionName = document.getElementById("formCustomOccasion").value.trim();
      occasionId = null;
    } else if (occasionId) {
      occasionName = resolveOccasionName(occasionId);
    }

    const giftName =
      document.getElementById("formGiftName")?.value.trim() || "";
    const note = document.getElementById("formNote")?.value.trim() || "";
    const imageUrl = normalizeHttpUrl(
      document.getElementById("formImageUrl")?.value || "",
    );
    const linkUrl = normalizeHttpUrl(
      document.getElementById("formLinkUrl")?.value || "",
    );
    const status = document.getElementById("formStatus").value;

    if (imageUrl && !isHttpUrl(imageUrl))
      throw new Error("Bild-URL muss mit http:// oder https:// beginnen.");
    if (linkUrl && !isHttpUrl(linkUrl))
      throw new Error("Link-URL muss mit http:// oder https:// beginnen.");

    if (currentTab === "gifts" || currentTab === "past") {
      const isPastTab = currentTab === "past";
      const date = document.getElementById("formDate").value;
      const noteWithMedia = buildGiftNoteWithMedia(note, imageUrl, linkUrl);

      if (!personId || !date || (!isPastTab && !giftName)) {
        alert("Person, Name und Datum sind erforderlich");
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-check-circle"></i> Speichern';
        return;
      }

      if (formMode === "edit" && editingItem) {
        const patch = {
          personId,
          personName,
          occasionId,
          occasionName,
          giftName,
          date,
          note: noteWithMedia,
          status,
        };

        if (isPastTab) {
          const isExplicitPastGift = pastGifts.some(
            (g) => g.id === editingItem,
          );
          const targetKind = isExplicitPastGift
            ? isDateInPast(date)
              ? "past"
              : "planned"
            : null;

          await updateGift(editingItem, {
            ...patch,
            ...(targetKind ? { kind: targetKind } : {}),
          });

          movedPastGiftToActive =
            isExplicitPastGift && targetKind === "planned";
        } else {
          await updateGift(editingItem, patch);
        }
      } else {
        if (isPastTab)
          throw new Error(
          "Vergangene Geschenke können nur bearbeitet werden.",
          );
        await createGift({
          personId,
          personName,
          occasionId,
          occasionName,
          giftName,
          date,
          note: noteWithMedia,
          status,
        });
      }
    } else {
      const ideaDate = document.getElementById("formIdeaDate")?.value || "";

      if (!personId) {
        alert("Person ist erforderlich");
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-check-circle"></i> Speichern';
        return;
      }

      if (!giftName && !note && !imageUrl && !linkUrl) {
        alert(
          "Bitte gib mindestens einen Geschenknamen, Infos oder eine Medien-URL ein",
        );
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-check-circle"></i> Speichern';
        return;
      }

      let type = "text";
      let content = note || giftName || "";
      if (imageUrl) {
        type = "image";
        content = imageUrl;
      } else if (linkUrl) {
        type = "link";
        content = linkUrl;
      }

      if (formMode === "edit" && editingItem) {
        await updateGiftIdea(editingItem, {
          personId,
          personName,
          occasionId,
          occasionName,
          giftName,
          type,
          content,
          note,
          date: ideaDate,
          status,
        });
      } else {
        await createGiftIdea({
          personId,
          personName,
          occasionId,
          occasionName,
          giftName,
          type,
          content,
          note,
          date: ideaDate,
          status,
        });
      }
    }

    await loadData();
    if (movedPastGiftToActive) {
      currentTab = "gifts";
      document.querySelectorAll("#giftsTabs .nav-link").forEach((tab) => {
        tab.classList.toggle("active", tab.dataset.tab === "gifts");
      });
    }
    formMode = "none";
    editingItem = null;

    renderFilters(document.getElementById("tabFilters"));
    renderList();
    renderForm();
    attachEventListeners(ctx);
  } catch (err) {
    console.error(err);
    alert("Fehler: " + err.message);
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-check-circle"></i> Speichern';
  }
}

async function handleConvertSubmit(e, ctx) {
  e.preventDefault();

  const user = await waitForUserOnce();
  if (!user) {
    window.location.href = "./login.html";
    return;
  }

  const convertForm = document.getElementById("convertForm");
  const btn = convertForm.querySelector('button[type="submit"]');
  const date = document.getElementById("convertDate").value;
  const note = document.getElementById("convertNote").value;
  const giftName = document.getElementById("convertGiftName").value.trim();

  if (!date || !giftName) {
    alert("Bitte fülle alle Pflichtfelder aus!");
    return;
  }

  try {
    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Wird konvertiert...';

    await convertIdeaToGift(convertIdeaId, { date, note, giftName });

    await loadData();
    formMode = "none";
    convertIdeaId = null;
    currentTab = "gifts";

    document.querySelectorAll("#giftsTabs .nav-link").forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.tab === "gifts");
    });

    renderFilters(document.getElementById("tabFilters"));
    renderList();
    renderForm();
    attachEventListeners(ctx);
  } catch (err) {
    console.error(err);
    alert("Fehler beim Konvertieren: " + err.message);
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-check-circle"></i> Konvertieren';
  }
}

async function handleDelete(ctx) {
  const source = getDisplayItemsForTab(currentTab);
  const item = source.find((x) => x.id === editingItem);
  const itemLabel =
    item?.giftName || item?.occasionName || item?.personName || "";
  const shouldDelete = await showDeleteConfirmModal(itemLabel);
  if (!shouldDelete) return;

  const user = await waitForUserOnce();
  if (!user) {
    window.location.href = "./login.html";
    return;
  }

  try {
    if (currentTab === "ideas") await deleteGiftIdea(editingItem);
    else await deleteGift(editingItem);

    await loadData();
    formMode = "none";
    editingItem = null;

    renderFilters(document.getElementById("tabFilters"));
    renderList();
    renderForm();
    attachEventListeners(ctx);
  } catch (err) {
    console.error(err);
    const label = currentTab === "ideas" ? "Die Geschenkidee" : "Das Geschenk";
    alert(getDeleteFailedMessage(err, label));
  }
}

function attachListListeners() {
  addListener(
    document.getElementById("selectAllGeneratedBtn"),
    "click",
    (e) => {
      e.preventDefault();
      generatedSuggestions.forEach((s) =>
        selectedGeneratedSuggestionIds.add(s._id),
      );
      renderList();
      attachListListeners();
    },
  );

  addListener(document.getElementById("clearGeneratedBtn"), "click", (e) => {
    e.preventDefault();
    clearGeneratedSuggestions();
    renderList();
    attachListListeners();
  });

  addListener(
    document.getElementById("adoptGeneratedBtn"),
    "click",
    async (e) => {
      e.preventDefault();
      await handleAdoptGeneratedSuggestions();
    },
  );

  document
    .querySelectorAll(".generated-suggestion-check")
    .forEach((checkbox) => {
      addListener(checkbox, "change", (e) => {
        const id = e.currentTarget.dataset.suggestionId;
        if (!id) return;
        if (e.currentTarget.checked) selectedGeneratedSuggestionIds.add(id);
        else selectedGeneratedSuggestionIds.delete(id);
        updateGeneratedAdoptButton();
      });
    });

  document.querySelectorAll("#listContainer .edit-btn").forEach((btn) => {
    addListener(btn, "click", (e) => {
      e.preventDefault();
      editingItem = btn.closest("[data-id]").dataset.id;
      formMode = "edit";
      renderForm();
      window.scrollTo(0, 0);
      attachEventListeners();
    });
  });

  document.querySelectorAll("#listContainer .delete-btn").forEach((btn) => {
    addListener(btn, "click", async (e) => {
      e.preventDefault();
      const id = btn.closest("[data-id]").dataset.id;
      const source = getDisplayItemsForTab(currentTab);
      const item = source.find((x) => x.id === id);
      const itemLabel =
        item?.giftName || item?.occasionName || item?.personName || "";
      const shouldDelete = await showDeleteConfirmModal(itemLabel);
      if (!shouldDelete) return;

      const user = await waitForUserOnce();
      if (!user) {
        window.location.href = "./login.html";
        return;
      }

      try {
        if (currentTab === "ideas") await deleteGiftIdea(id);
        else await deleteGift(id);

        await loadData();
        renderList();
        attachListListeners();
      } catch (err) {
        console.error(err);
        const label =
          currentTab === "ideas" ? "Die Geschenkidee" : "Das Geschenk";
        alert(getDeleteFailedMessage(err, label));
      }
    });
  });

  if (currentTab === "ideas") {
    document.querySelectorAll("#listContainer .convert-btn").forEach((btn) => {
      addListener(btn, "click", (e) => {
        e.preventDefault();
        convertIdeaId = btn.closest("[data-id]").dataset.id;
        formMode = "convert";
        renderForm();
        window.scrollTo(0, 0);
        attachEventListeners();
      });
    });
  }
}

// ---------- Public API ----------

export async function render(container, ctx) {
  ctx.setPageHeader(
    "Geschenke & Ideen",
    "Verwalte hier deine Geschenke, Geschenkideen und vergangene Geschenke.",
  );

  if (ctx.params) {
    if (
      ctx.params.tab === "gifts" ||
      ctx.params.tab === "ideas" ||
      ctx.params.tab === "past"
    )
      currentTab = ctx.params.tab;
    if (ctx.params.status) filters.status = ctx.params.status;
    if (ctx.params.personId) filters.person = ctx.params.personId;
    if (ctx.params.id) focusItemId = ctx.params.id;
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
          <a class="nav-link ${currentTab === "gifts" ? "active" : ""}" href="#" data-tab="gifts" role="tab">
            <i class="bi bi-gift"></i> Geschenke
          </a>
        </li>
        <li class="nav-item" role="presentation">
          <a class="nav-link ${currentTab === "ideas" ? "active" : ""}" href="#" data-tab="ideas" role="tab">
            <i class="bi bi-lightbulb"></i> Geschenkideen
          </a>
        </li>
        <li class="nav-item" role="presentation">
          <a class="nav-link ${currentTab === "past" ? "active" : ""}" href="#" data-tab="past" role="tab">
            <i class="bi bi-clock-history"></i> Vergangen
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
  renderFilters(document.getElementById("tabFilters"));
  renderList();
  renderForm();
  attachEventListeners(ctx);
}

export function destroy() {
  if (activeDeleteModalCleanup) activeDeleteModalCleanup(false);
  if (activeSharePickerCleanup) activeSharePickerCleanup(null);
  if (activeShareResultCleanup) activeShareResultCleanup();
  removeAllListeners();
  gifts = [];
  ideas = [];
  pastGifts = [];
  persons = [];
  occasions = [];
  editingItem = null;
  formMode = "none";
  convertIdeaId = null;
  focusItemId = null;
  clearGeneratedSuggestions();
}
