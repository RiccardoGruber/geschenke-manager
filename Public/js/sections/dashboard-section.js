/**
 * dashboard-section.js
 * -------------------------------------------------------
 */

import { listPersons }   from '../person-service.js';
import { listOccasions } from '../occasion-service.js';
import { listGiftIdeas } from '../gift-idea-service.js';

// ---------- Date Helpers ----------

function _asDate(val) {
  if (!val) return null;
  if (typeof val === 'object' && typeof val.toDate === 'function') return val.toDate();
  if (val instanceof Date) return val;
  if (typeof val === 'string') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function _formatDateShort(val) {
  const d = _asDate(val);
  return d ? d.toLocaleDateString('de-DE') : '—';
}

function _formatDateLong(val) {
  const d = _asDate(val);
  return d ? d.toLocaleDateString('de-DE', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '—';
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

function _sortByDateAsc(a, b) {
  const da = _asDate(a?.date) || new Date('9999-12-31');
  const db = _asDate(b?.date) || new Date('9999-12-31');
  return da - db;
}

function _sortByUpdatedDesc(a, b) {
  const da = _asDate(a?.updatedAt) || _asDate(a?.createdAt) || new Date(0);
  const db = _asDate(b?.updatedAt) || _asDate(b?.createdAt) || new Date(0);
  return db - da;
}

// ---------- UI Builders ----------

function kpiCard(iconHtml, title, value, accent, section, params = {}) {
  let attrs = '';
  if (section)     attrs += ` data-section="${section}"`;
  if (params.tab)  attrs += ` data-tab="${params.tab}"`;

  const cursorStyle = section ? 'pointer' : 'default';
  return `
    <div class="col-12 col-sm-6 col-md-4">
      <div class="card card-custom p-3 h-100" style="cursor: ${cursorStyle};"${attrs}>
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

function renderNextOccasionsCard(occasions) {
  // renderNextCard builds but currently returns empty — placeholder for future implementation.
  return ``;
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
    </div>
  `;
}

function renderNotificationsCard(persons, giftIdeas) {
  const reminderDays = Number(localStorage.getItem('reminderDays') || 7);
  const notifications = [];

  // Geburtstage in den nächsten N Tagen
  persons
    .filter(p => p.birthday)
    .filter(p => {
      const days = _daysDiffFromToday(p.birthday);
      return days !== null && days >= 0 && days <= reminderDays;
    })
    .sort((a, b) => _daysDiffFromToday(a.birthday) - _daysDiffFromToday(b.birthday))
    .forEach(p => {
      const days = _daysDiffFromToday(p.birthday);
      const when = days === 0 ? 'heute' : `in ${days} Tag${days === 1 ? '' : 'en'}`;
      notifications.push({ icon: '🎂', text: `Geburtstag von ${p.name} ${when}` });
    });

  // Offene Ideen ohne Personenzuordnung (max. 2)
  giftIdeas
    .filter(gi => !gi.personId)
    .slice(0, 2)
    .forEach(gi => {
      notifications.push({ icon: '💡', text: `Offene Idee: ${gi.content?.substring(0, 40) || 'Unbekannt'}` });
    });

  if (!notifications.length) {
    return `
      <div class="card card-custom p-3 text-center text-muted">
        <i class="bi bi-bell" style="font-size:2rem"></i>
        <h6 class="mt-2">Benachrichtigungen</h6>
        <p class="small mb-0">Alles im Plan! 👍</p>
      </div>
    `;
  }

  const items = notifications.slice(0, 5).map(n => `
    <li class="list-group-item d-flex gap-2 align-items-start">
      <span style="font-size: 1.2rem; line-height: 1.5;">${n.icon}</span>
      <span class="small flex-grow-1">${n.text}</span>
    </li>
  `).join('');

  return `
    <div class="card card-custom p-3">
      <h6 class="mb-2">Benachrichtigungen</h6>
      <ul class="list-group list-group-flush" style="font-size: 0.9rem;">${items}</ul>
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

// ---------- Event Listener Management ----------

let listeners = [];

function clearListeners() {
  listeners.forEach(({ element, handler }) => element.removeEventListener('click', handler));
  listeners = [];
}

function registerKpiNav(container, ctx) {
  container.querySelectorAll('[data-section]').forEach(el => {
    const handler = (e) => {
      e.preventDefault();
      const params = el.dataset.tab ? { tab: el.dataset.tab } : {};
      ctx.navigate(el.dataset.section, params);
    };
    el.addEventListener('click', handler);
    listeners.push({ element: el, handler });
  });
}

function registerQuickActions(container, ctx) {
  container.querySelectorAll('[data-action]').forEach(btn => {
    const action = btn.getAttribute('data-action');
    const handler = (e) => {
      e.preventDefault();
      ctx.navigate(action);
    };
    btn.addEventListener('click', handler);
    listeners.push({ element: btn, handler });
  });
}

// ---------- Public API ----------

export async function render(container, ctx) {
  clearListeners();

  container.innerHTML = `
    <div class="container-fluid">
      <div class="text-muted">Dashboard lädt...</div>
    </div>
  `;

  let persons    = [];
  let occasions  = [];
  let giftIdeas  = [];

  try {
    [persons, occasions, giftIdeas] = await Promise.all([
      listPersons(),
      listOccasions(),
      listGiftIdeas()
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

  const personsCount  = persons.length;
  const giftsCount    = giftIdeas.length;
  const upcomingCount = occasions
    .filter(o => o.isActive !== false)
    .filter(o => _isWithinDays(o.date, 30))
    .length;

  const kpisHtml = `
    ${kpiCard('<i class="bi bi-people-fill"></i>',    'Personen', personsCount,  'primary', 'persons')}
    ${kpiCard('<i class="bi bi-calendar-event"></i>', 'Anlässe',  upcomingCount, 'danger',  'occasions')}
    ${kpiCard('<i class="bi bi-lightbulb-fill"></i>', 'Geschenke', giftsCount,   'warning', 'gifts', { tab: 'ideas' })}
  `;

  const recentPersons       = [...persons].sort(_sortByUpdatedDesc).slice(0, 5);
  const recentPersonsHtml   = renderRecentPersonsCard(recentPersons);
  const notificationsHtml   = renderNotificationsCard(persons, giftIdeas);
  const quickHtml           = renderQuickActionsCard();

  // upcomingHtml placeholder (renderNextOccasionsCard is a stub pending implementation)
  const upcomingHtml = renderNextOccasionsCard(
    occasions.filter(o => o.isActive !== false).sort(_sortByDateAsc)
  );

  container.innerHTML = `
    <div class="container-fluid">
      <div class="row g-3 mb-4">${kpisHtml}</div>

      <div class="dashboard-section">
        <div class="dashboard-grid">
          <div class="dashboard-card">${upcomingHtml}</div>
          <div class="dashboard-card span-full">${notificationsHtml}</div>
          <div class="dashboard-card">${recentPersonsHtml}</div>
          <div class="dashboard-card">${quickHtml}</div>
        </div>
      </div>
    </div>
  `;

  registerQuickActions(container, ctx);
  registerKpiNav(container, ctx);
}

export function destroy() {
  clearListeners();
}
