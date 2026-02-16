/**
 * dashboard-section.js
 * -------------------------------------------------------
 * Dashboard-Sektion (REAL DATA)
 * - KPI Cards: Persons, Upcoming Occasions (30d), Gift Ideas (TODO), ToDos (TODO)
 * - Nächste Anlässe (nach Datum)
 * - Zuletzt hinzugefügte Personen (nach createdAt/updatedAt)
 * - Quick Actions navigieren in echte Sections
 */

import { listPersons } from '../person-service.js';
import { listOccasions } from '../occasion-service.js';

// ---------- Helpers (Timestamp/Date safe) ----------
function _asDate(val) {
  if (!val) return null;
  if (typeof val === 'object' && typeof val.toDate === 'function') return val.toDate(); // Firestore Timestamp
  if (val instanceof Date) return val;
  if (typeof val === 'string') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function _formatDateShort(val) {
  const d = _asDate(val);
  if (!d) return '—';
  return d.toLocaleDateString('de-DE');
}

function _formatDateLong(val) {
  const d = _asDate(val);
  if (!d) return '—';
  return d.toLocaleDateString('de-DE', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function _daysDiffFromToday(val) {
  const d = _asDate(val);
  if (!d) return null;
  const today = new Date();
  d.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return Math.floor((d - today) / (1000 * 60 * 60 * 24));
}

function _isWithinDays(val, days) {
  const diff = _daysDiffFromToday(val);
  return diff !== null && diff >= 0 && diff <= days;
}

function _sortByBestDateAsc(a, b) {
  const da = _asDate(a?.date) || new Date('9999-12-31');
  const db = _asDate(b?.date) || new Date('9999-12-31');
  return da - db;
}

function _sortByBestCreatedDesc(a, b) {
  const da =
    _asDate(a?.updatedAt) ||
    _asDate(a?.createdAt) ||
    new Date(0);
  const db =
    _asDate(b?.updatedAt) ||
    _asDate(b?.createdAt) ||
    new Date(0);
  return db - da;
}

// ---------- UI Builders ----------
function kpiCard(iconHtml, title, value, accent) {
  return `
    <div class="col-12 col-sm-6 col-md-3">
      <div class="card card-custom p-3 h-100">
        <div class="d-flex align-items-center">
          <div class="flex-grow-1">
            <div class="text-muted small">${title}</div>
            <div class="h4 mb-0">${value}</div>
          </div>
          <div class="ms-3 display-6 text-${accent}">${iconHtml}</div>
        </div>
      </div>
    </div>
  `;
}

function renderUpcomingOccasionsCard(occ) {
  if (!occ.length) {
    return `
      <div class="card card-custom p-3">
        <div class="text-center text-muted">
          <i class="bi bi-calendar-event" style="font-size:2rem"></i>
          <h6 class="mt-2">Keine kommenden Anlässe</h6>
          <p class="small mb-0">Füge neue Anlässe hinzu, um sie hier zu sehen.</p>
        </div>
      </div>
    `;
  }

  const items = occ.map(o => {
    const typeLabel = o.type === 'fixed' ? 'Fest' : 'Frei';
    const personLabel = (o.person && String(o.person).trim()) ? o.person : '—';
    return `
      <li class="list-group-item d-flex justify-content-between align-items-center">
        <div>
          <div class="fw-semibold">${o.name || '—'}</div>
          <div class="small text-muted">${personLabel} • ${typeLabel}</div>
        </div>
        <div>
          <span class="badge bg-light text-dark">${_formatDateShort(o.date)}</span>
        </div>
      </li>
    `;
  }).join('');

  return `
    <div class="card card-custom p-3">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <h6 class="mb-0">Nächste Anlässe</h6>
      </div>
      <ul class="list-group list-group-flush">${items}</ul>
    </div>
  `;
}

function renderQuickActionsCard() {
  return `
    <div class="card card-custom p-3">
      <h6>Quick Actions</h6>
      <div class="d-grid gap-2 mt-3">
        <button class="btn btn-primary" data-action="persons">
          <i class="bi bi-person-plus"></i> Person hinzufügen
        </button>
        <button class="btn btn-outline-primary" data-action="occasions">
          <i class="bi bi-calendar-plus"></i> Anlass anlegen
        </button>
        <button class="btn btn-outline-success" data-action="gifts">
          <i class="bi bi-gift"></i> Geschenkidee hinzufügen
        </button>
      </div>
      <div class="small text-muted mt-3">Hinweis: Geschenkideen/ToDos werden angebunden, sobald Service-Dateien vorhanden sind.</div>
    </div>
  `;
}

function renderRecentPersonsCard(persons) {
  if (!persons.length) {
    return `
      <div class="card card-custom p-3 text-center text-muted">
        <i class="bi bi-people" style="font-size:2rem"></i>
        <h6 class="mt-2">Keine Personen</h6>
        <p class="small mb-0">Füge Personen hinzu, um sie hier anzuzeigen.</p>
      </div>
    `;
  }

  const items = persons.map(p => {
    const d = _asDate(p.updatedAt) || _asDate(p.createdAt);
    return `
      <li class="list-group-item d-flex justify-content-between align-items-center">
        <div>${p.name || '—'}</div>
        <div class="small text-muted">${d ? _formatDateLong(d) : '—'}</div>
      </li>
    `;
  }).join('');

  return `
    <div class="card card-custom p-3">
      <h6 class="mb-2">Zuletzt hinzugefügte Personen</h6>
      <ul class="list-group list-group-flush">${items}</ul>
    </div>
  `;
}

function renderRecentGiftsCardPlaceholder() {
  return `
    <div class="card card-custom p-3 text-center text-muted">
      <i class="bi bi-gift" style="font-size:2rem"></i>
      <h6 class="mt-2">Geschenkideen</h6>
      <p class="small mb-0">Noch kein Gift-Service angebunden. Sobald der Service angebunden ist, werden hier echte Daten gezeigt.</p>
    </div>
  `;
}

// ---------- Quick action listeners ----------
let listeners = [];

function clearListeners() {
  listeners.forEach(({ element, handler }) => element.removeEventListener('click', handler));
  listeners = [];
}

function registerQuickActions(container, ctx) {
  container.querySelectorAll('[data-action]').forEach(btn => {
    const action = btn.getAttribute('data-action');
    const handler = (e) => {
      e.preventDefault();
      // echte Navigation in deine Sections
      if (action === 'persons') ctx.navigate('persons');
      if (action === 'occasions') ctx.navigate('occasions');
      if (action === 'gifts') ctx.navigate('gifts');
    };
    btn.addEventListener('click', handler);
    listeners.push({ element: btn, handler });
  });
}

// ---------- Public API ----------
export async function render(container, ctx) {
  clearListeners();

  // Welcome bleibt wie bei dir
  const welcomeBox = document.querySelector('.dashboard-welcome');
  if (welcomeBox) {
    const nameDisplay = (ctx.userLabel || '').split('@')[0] || 'User';
    welcomeBox.innerHTML = `<h1>Willkommen zurück, <span id="welcomeName">${nameDisplay}</span>!</h1>`;
  }

  // Loading Skeleton
  container.innerHTML = `
    <div class="container-fluid">
      <div class="text-muted">Dashboard lädt...</div>
    </div>
  `;

  // 1) Daten laden
  let persons = [];
  let occasions = [];

  try {
    [persons, occasions] = await Promise.all([
      listPersons(),
      listOccasions()
    ]);
  } catch (e) {
    console.error('Dashboard load failed:', e);
    container.innerHTML = `
      <div class="alert alert-danger">
        <i class="bi bi-exclamation-circle"></i>
        Dashboard konnte nicht geladen werden: ${e?.message || e}
      </div>
    `;
    return;
  }

  // 2) KPIs
  const personsCount = persons.length;

  const upcomingOccasions30 = occasions
    .filter(o => (o.isActive !== false))          // aktive
    .filter(o => _isWithinDays(o.date, 30));      // nächste 30 Tage

  const upcomingCount = upcomingOccasions30.length;

  // TODO später: giftsCount / todoCount aus Services
  const giftsCount = 0;
  const todoCount = 0;

  const kpisHtml = `
    ${kpiCard('<i class="bi bi-people-fill"></i>', 'Personen', personsCount, 'primary')}
    ${kpiCard('<i class="bi bi-calendar-event"></i>', 'Anlässe (kommend)', upcomingCount, 'danger')}
    ${kpiCard('<i class="bi bi-lightbulb-fill"></i>', 'Geschenk Ideen', giftsCount, 'warning')}
    ${kpiCard('<i class="bi bi-list-check"></i>', 'Offen / To-Do', todoCount, 'success')}
  `;

  // 3) Nächste Anlässe (zeige max 5, sortiert)
  const upcomingOccasions = occasions
    .filter(o => o.isActive !== false)
    .filter(o => _isWithinDays(o.date, 365)) // “kommend” – du kannst auch 90/30 machen
    .sort(_sortByBestDateAsc)
    .slice(0, 5);

  const upcomingHtml = renderUpcomingOccasionsCard(upcomingOccasions);

  // 4) Zuletzt hinzugefügte Personen (max 5)
  const recentPersons = [...persons].sort(_sortByBestCreatedDesc).slice(0, 5);
  const recentPersonsHtml = renderRecentPersonsCard(recentPersons);

  // 5) Gifts Placeholder
  const recentGiftsHtml = renderRecentGiftsCardPlaceholder();

  // Quick Actions
  const quickHtml = renderQuickActionsCard();

  // Render Layout
  container.innerHTML = `
    <div class="container-fluid">
      <!-- Row 1: KPI Cards -->
      <div class="row g-3 mb-4">${kpisHtml}</div>

      <!-- Row 2: Upcoming / Quick Actions -->
      <div class="row g-3 mb-4">
        <div class="col-12 col-lg-7">${upcomingHtml}</div>
        <div class="col-12 col-lg-5">${quickHtml}</div>
      </div>

      <!-- Row 3: Recent Persons / Gifts -->
      <div class="row g-3">
        <div class="col-12 col-md-6">${recentPersonsHtml}</div>
        <div class="col-12 col-md-6">${recentGiftsHtml}</div>
      </div>
    </div>
  `;

  registerQuickActions(container, ctx);
}

export function destroy() {
  clearListeners();
}
