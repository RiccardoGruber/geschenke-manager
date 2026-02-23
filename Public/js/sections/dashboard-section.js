/**
 * dashboard-section.js
 * -------------------------------------------------------
 */

import { listPersons } from '../person-service.js';
import { listOccasions } from '../occasion-service.js';
import { listGiftIdeas } from '../gift-idea-service.js';

// ---------- Date Helpers ----------

function _asDate(val) {
  if (!val) return null;
  if (typeof val === 'object' && typeof val.toDate === 'function') return val.toDate();
  if (val instanceof Date) return val;
  if (typeof val === 'string') {
    const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(val.trim());
    if (ymd) {
      const d = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function _formatDateLong(val) {
  const d = _asDate(val);
  return d
    ? d.toLocaleDateString('de-DE', { year: 'numeric', month: '2-digit', day: '2-digit' })
    : '-';
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

function _normalizeText(val) {
  return String(val || '').trim().toLowerCase();
}

function _escapeHtml(val) {
  return String(val || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _uniqueById(items) {
  const map = new Map();
  (items || []).forEach((item) => {
    const key = item?.id || JSON.stringify(item);
    if (!map.has(key)) map.set(key, item);
  });
  return [...map.values()];
}

function _isDateInChristmasSeason(today = new Date()) {
  const year = today.getFullYear();
  const start = new Date(year, 10, 1);  // 01.11.
  const end = new Date(year, 11, 24);   // 24.12.
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return t >= start && t <= end;
}

// ---------- Notification Logic ----------

export function getUpcomingBirthdays(persons, giftIdeas, occasions, today = new Date()) {
  const nextMonth = (today.getMonth() + 1) % 12;
  const nextMonthYear = today.getMonth() === 11 ? today.getFullYear() + 1 : today.getFullYear();

  const birthdayOccasionIds = new Set(['geburtstag']);
  (occasions || []).forEach((occasion) => {
    if (_normalizeText(occasion?.name) === 'geburtstag' && occasion?.id) {
      birthdayOccasionIds.add(occasion.id);
    }
  });

  return _uniqueById(persons)
    .filter((person) => person?.birthday)
    .map((person) => {
      const birthday = _asDate(person.birthday);
      if (!birthday) return null;

      const birthMonth = birthday.getMonth();
      const birthDay = birthday.getDate();
      if (birthMonth !== nextMonth) return null;

      const thisBirthday = new Date(nextMonthYear, nextMonth, birthDay);
      if (thisBirthday.getMonth() !== nextMonth) return null;

      const ideasForBirthday = _uniqueById(
        (giftIdeas || []).filter((idea) => {
          const isSamePerson = idea?.personId && person?.id && idea.personId === person.id;
          if (!isSamePerson) return false;

          const byOccasionId = idea?.occasionId && birthdayOccasionIds.has(idea.occasionId);
          const byOccasionName = _normalizeText(idea?.occasionName) === 'geburtstag';
          return byOccasionId || byOccasionName;
        })
      );

      return {
        personId: person.id,
        personName: person.name || '-',
        birthdayDate: thisBirthday,
        ideas: ideasForBirthday.map((idea) => ({
          id: idea.id,
          status: _normalizeText(idea.status) || 'offen',
          title: idea.giftName || idea.content || idea.note || 'Geschenkidee'
        })),
        hasIdeas: ideasForBirthday.length > 0
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.birthdayDate - b.birthdayDate);
}

export function getChristmasStatus(persons, giftIdeas, occasions, today = new Date()) {
  const inSeason = _isDateInChristmasSeason(today);

  const personsById = new Map();
  const personsByName = new Map();
  _uniqueById(persons).forEach((person) => {
    if (person?.id) personsById.set(person.id, person);
    if (person?.name) personsByName.set(_normalizeText(person.name), person);
  });

  const christmasOccasionIds = new Set(['weihnachten']);
  const christmasPersonIds = new Set();
  (occasions || []).forEach((occasion) => {
    if (_normalizeText(occasion?.name) !== 'weihnachten') return;
    if (occasion?.id) christmasOccasionIds.add(occasion.id);

    const rawPerson = _normalizeText(occasion?.person);
    if (!rawPerson) return;

    // occasion.person is saved as person name in this project.
    const matchedByName = personsByName.get(rawPerson);
    if (matchedByName?.id) christmasPersonIds.add(matchedByName.id);
    if (personsById.has(rawPerson)) christmasPersonIds.add(rawPerson);
  });

  const christmasIdeas = _uniqueById(
    (giftIdeas || []).filter((idea) => {
      const byOccasionId = idea?.occasionId && christmasOccasionIds.has(idea.occasionId);
      const byOccasionName = _normalizeText(idea?.occasionName) === 'weihnachten';
      return byOccasionId || byOccasionName;
    })
  );

  christmasIdeas.forEach((idea) => {
    if (idea?.personId) christmasPersonIds.add(idea.personId);
  });

  const christmasPersons = [...christmasPersonIds]
    .map((personId) => personsById.get(personId))
    .filter(Boolean)
    .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'de'));

  const items = christmasPersons.map((person) => {
    const personIdeas = christmasIdeas
      .filter((idea) => idea?.personId === person.id)
      .map((idea) => {
        const status = _normalizeText(idea?.status);
        const normalizedStatus = status === 'besorgt' || status === 'erledigt' ? status : 'offen';
        return {
          id: idea.id,
          title: idea.giftName || idea.content || idea.note || 'Geschenkidee',
          status: normalizedStatus
        };
      });

    const statusCounts = { offen: 0, besorgt: 0, erledigt: 0 };
    personIdeas.forEach((idea) => {
      statusCounts[idea.status] += 1;
    });

    const hasIdeas = personIdeas.length > 0;
    const hasOpen = !hasIdeas || statusCounts.offen > 0 || statusCounts.besorgt > 0;

    return {
      personId: person.id,
      personName: person.name || '-',
      ideas: personIdeas,
      statusCounts,
      hasIdeas,
      hasOpen
    };
  });

  const openCount = items.reduce((sum, item) => sum + (item.hasOpen ? 1 : 0), 0);

  return {
    inSeason,
    items,
    openCount
  };
}

export function renderNotifications(upcomingBirthdays, christmasStatus) {
  const birthdayOpenCount = upcomingBirthdays.reduce((sum, entry) => {
    return sum + (entry.hasIdeas ? 0 : 1);
  }, 0);

  const badgeCount = birthdayOpenCount + christmasStatus.openCount;
  const badgeHtml = badgeCount > 0
    ? `<span class="badge rounded-pill bg-danger ms-2">${badgeCount}</span>`
    : `<span class="badge rounded-pill bg-success ms-2">0</span>`;

  const birthdaysHtml = upcomingBirthdays.length ? upcomingBirthdays.map((entry) => {
    const subtitle = entry.hasIdeas
      ? `${entry.ideas.length} Idee${entry.ideas.length === 1 ? '' : 'n'} vorhanden`
      : 'Keine Geschenkidee vorhanden';
    const subtitleClass = entry.hasIdeas ? 'text-muted' : 'text-warning';

    return `
      <div class="border rounded-3 p-2 mb-2 bg-white"
           data-notification-person="${_escapeHtml(entry.personId || '')}"
           style="cursor:pointer;">
        <div class="d-flex align-items-start gap-2">
          <div class="pt-1"><i class="bi bi-envelope-fill text-primary"></i></div>
          <div class="flex-grow-1">
            <div class="fw-semibold">${_escapeHtml(entry.personName)}</div>
            <div class="small text-muted">${_formatDateLong(entry.birthdayDate)}</div>
            <div class="small ${subtitleClass}">${subtitle}</div>
          </div>
          <span class="badge bg-light text-dark">Geburtstag</span>
        </div>
      </div>
    `;
  }).join('') : `
    <div class="border rounded-3 p-3 text-muted small bg-white">
      <i class="bi bi-inbox me-1"></i> Keine anstehenden Geburtstage
    </div>
  `;

  let christmasHtml = '';
  if (!christmasStatus.inSeason) {
    christmasHtml = `
      <div class="border rounded-3 p-3 text-muted small bg-white">
        <i class="bi bi-inbox me-1"></i> Weihnachtsstatus wird vom 01.11. bis 24.12. angezeigt.
      </div>
    `;
  } else {
    const openItems = christmasStatus.items.filter((item) => item.hasOpen);
    christmasHtml = openItems.length ? openItems.map((item) => {
      const text = item.hasIdeas
        ? `offen: ${item.statusCounts.offen}, besorgt: ${item.statusCounts.besorgt}, erledigt: ${item.statusCounts.erledigt}`
        : 'Keine Geschenkidee vorhanden';
      const textClass = item.hasIdeas ? 'text-muted' : 'text-warning';

      return `
        <div class="border rounded-3 p-2 mb-2 bg-white"
             data-notification-person="${_escapeHtml(item.personId || '')}"
             style="cursor:pointer;">
          <div class="d-flex align-items-start gap-2">
            <div class="pt-1"><i class="bi bi-envelope-fill text-danger"></i></div>
            <div class="flex-grow-1">
              <div class="fw-semibold">${_escapeHtml(item.personName)}</div>
              <div class="small ${textClass}">${text}</div>
            </div>
            <span class="badge bg-light text-dark">Weihnachten</span>
          </div>
        </div>
      `;
    }).join('') : `
      <div class="border rounded-3 p-3 text-muted small bg-white">
        <i class="bi bi-inbox me-1"></i> Keine offenen Weihnachtsgeschenke
      </div>
    `;
  }

  return `
    <div class="card card-custom p-3">
      <div class="d-flex align-items-center justify-content-between mb-3 p-2 rounded-3 border bg-light">
        <div class="fw-semibold">
          <i class="bi bi-inbox-fill me-2"></i>Postfach Benachrichtigungen
        </div>
        <div>${badgeHtml}</div>
      </div>

      <div class="mb-3">
        <div class="text-uppercase small fw-semibold text-muted mb-2">Geburtstage im nächsten Monat</div>
        ${birthdaysHtml}
      </div>

      <div>
        <div class="text-uppercase small fw-semibold text-muted mb-2">Weihnachtsstatus</div>
        ${christmasHtml}
      </div>
    </div>
  `;
}
// ---------- UI Builders ----------

function kpiCard(iconHtml, title, value, accent, section, params = {}) {
  let attrs = '';
  if (section) attrs += ` data-section="${section}"`;
  if (params.tab) attrs += ` data-tab="${params.tab}"`;

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

function renderNextOccasionsCard() {
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

  const items = persons.map((person) => {
    const d = _asDate(person.updatedAt) || _asDate(person.createdAt);
    return `
      <li class="list-group-item d-flex justify-content-between align-items-center">
        <div>${_escapeHtml(person.name || '-')}</div>
        <div class="small text-muted">${d ? _formatDateLong(d) : '-'}</div>
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
  container.querySelectorAll('[data-section]').forEach((el) => {
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
  container.querySelectorAll('[data-action]').forEach((btn) => {
    const action = btn.getAttribute('data-action');
    const handler = (e) => {
      e.preventDefault();
      ctx.navigate(action);
    };
    btn.addEventListener('click', handler);
    listeners.push({ element: btn, handler });
  });
}

function registerNotificationNav(container, ctx) {
  container.querySelectorAll('[data-notification-person]').forEach((entry) => {
    const personId = entry.getAttribute('data-notification-person');
    if (!personId) return;

    const handler = (e) => {
      e.preventDefault();
      ctx.navigate('persons', { id: personId });
    };
    entry.addEventListener('click', handler);
    listeners.push({ element: entry, handler });
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

  let persons = [];
  let occasions = [];
  let giftIdeas = [];

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

  const personsCount = persons.length;
  const giftsCount = giftIdeas.length;
  const upcomingCount = occasions
    .filter((o) => o.isActive !== false)
    .filter((o) => _isWithinDays(o.date, 30))
    .length;

  const kpisHtml = `
    ${kpiCard('<i class="bi bi-people-fill"></i>', 'Personen', personsCount, 'primary', 'persons')}
    ${kpiCard('<i class="bi bi-calendar-event"></i>', 'Anlässe', upcomingCount, 'danger', 'occasions')}
    ${kpiCard('<i class="bi bi-lightbulb-fill"></i>', 'Geschenke', giftsCount, 'warning', 'gifts', { tab: 'ideas' })}
  `;

  const upcomingBirthdays = getUpcomingBirthdays(persons, giftIdeas, occasions);
  const christmasStatus = getChristmasStatus(persons, giftIdeas, occasions);
  const notificationsHtml = renderNotifications(upcomingBirthdays, christmasStatus);

  const quickHtml = renderQuickActionsCard();
  const upcomingHtml = renderNextOccasionsCard(
    occasions.filter((o) => o.isActive !== false).sort(_sortByDateAsc)
  );

  container.innerHTML = `
    <div class="container-fluid">
      <div class="row g-3 mb-4">${kpisHtml}</div>

      <div class="dashboard-section">
        <div class="dashboard-grid">
          <div class="dashboard-card">${upcomingHtml}</div>
          <div class="dashboard-card span-full">${notificationsHtml}</div>
          <div class="dashboard-card span-full">${quickHtml}</div>
        </div>
      </div>
    </div>
  `;

  registerQuickActions(container, ctx);
  registerKpiNav(container, ctx);
  registerNotificationNav(container, ctx);
}

export function destroy() {
  clearListeners();
}

