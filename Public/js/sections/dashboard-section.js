/**
 * dashboard-section.js
 * -------------------------------------------------------
 * Dashboard-Sektion
 * Zeigt KPI Cards, nächste Anlässe, Quick Actions und zuletzt hinzugefügte Items
 */

// Mock data (UI-only). TODO: replace with real service data later
const mockPersons = [
  { id: 'p1', name: 'Anna Müller', addedAt: '2026-01-20' },
  { id: 'p2', name: 'Max Mustermann', addedAt: '2026-01-15' },
  { id: 'p3', name: 'Lisa Meier', addedAt: '2026-01-10' }
];

const mockOccasions = [
  { id: 'o1', name: 'Geburtstag Anna', person: 'Anna Müller', date: _isoDateOffset(5), type: 'fixed', isActive: true },
  { id: 'o2', name: 'Weihnachten', person: 'Familie', date: _isoDateOffset(20), type: 'fixed', isActive: true },
  { id: 'o3', name: 'Jahrestag', person: 'Lisa Meier', date: _isoDateOffset(40), type: 'free', isActive: true }
];

const mockGifts = [
  { id: 'g1', title: 'Buch: Clean Code', person: 'Max Mustermann', addedAt: '2026-01-18' },
  { id: 'g2', title: 'Kaffee Abo', person: 'Anna Müller', addedAt: '2026-01-12' }
];

// --- Helper utilities ---

function _isoDateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function _isWithinDays(dateStr, days) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = (d - now) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= days;
}

function _formatDate(dateStr) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString();
  } catch (e) {
    return dateStr;
  }
}

// --- Render functions ---

function renderKpis() {
  const personsCount = mockPersons.length;
  const upcomingCount = mockOccasions.filter(o => _isWithinDays(o.date, 30)).length;
  const giftsCount = mockGifts.length;
  const todoCount = 3;

  const kpiCard = (icon, title, value, accent) => `
    <div class="col-12 col-sm-6 col-md-3">
      <div class="card card-custom p-3 h-100">
        <div class="d-flex align-items-center">
          <div class="flex-grow-1">
            <div class="text-muted small">${title}</div>
            <div class="h4 mb-0">${value}</div>
          </div>
          <div class="ms-3 display-6 text-${accent}">${icon}</div>
        </div>
      </div>
    </div>
  `;

  return `
    ${kpiCard('<i class="bi bi-people-fill"></i>', 'Personen', personsCount, 'primary')}
    ${kpiCard('<i class="bi bi-calendar-event"></i>', 'Anlässe (kommend)', upcomingCount, 'danger')}
    ${kpiCard('<i class="bi bi-lightbulb-fill"></i>', 'Geschenk Ideen', giftsCount, 'warning')}
    ${kpiCard('<i class="bi bi-list-check"></i>', 'Offen / To-Do', todoCount, 'success')}
  `;
}

function renderUpcomingOccasions() {
  const occ = mockOccasions
    .filter(o => _isWithinDays(o.date, 365))
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 5);

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

  const items = occ.map(o => `
    <li class="list-group-item d-flex justify-content-between align-items-center">
      <div>
        <div class="fw-semibold">${o.name}</div>
        <div class="small text-muted">${o.person} • ${o.type === 'fixed' ? 'Fest' : 'Frei'}</div>
      </div>
      <div>
        <span class="badge bg-light text-dark">${_formatDate(o.date)}</span>
      </div>
    </li>
  `).join('');

  return `
    <div class="card card-custom p-3">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <h6 class="mb-0">Nächste Anlässe</h6>
      </div>
      <ul class="list-group list-group-flush">${items}</ul>
    </div>
  `;
}

function renderQuickActions() {
  return `
    <div class="card card-custom p-3">
      <h6>Quick Actions</h6>
      <div class="d-grid gap-2 mt-3">
        <button class="btn btn-primary" data-action="add-person"><i class="bi bi-person-plus"></i> Person hinzufügen</button>
        <button class="btn btn-outline-primary" data-action="add-occasion"><i class="bi bi-calendar-plus"></i> Anlass anlegen</button>
        <button class="btn btn-outline-success" data-action="add-gift"><i class="bi bi-gift"></i> Geschenkidee hinzufügen</button>
        <button class="btn btn-outline-secondary" data-action="import-sample"><i class="bi bi-upload"></i> Import / Beispieldaten laden</button>
      </div>
      <div class="small text-muted mt-3">Hinweis: Die Buttons sind UI-only.</div>
    </div>
  `;
}

function renderRecentPersons() {
  const persons = mockPersons.slice(0, 5);
  if (!persons.length) {
    return `
      <div class="card card-custom p-3 text-center text-muted">
        <i class="bi bi-people" style="font-size:2rem"></i>
        <h6 class="mt-2">Keine Personen</h6>
        <p class="small mb-0">Füge Personen hinzu, um sie hier anzuzeigen.</p>
      </div>
    `;
  }

  const items = persons.map(p => `
    <li class="list-group-item d-flex justify-content-between align-items-center">
      <div>${p.name}</div>
      <div class="small text-muted">${p.addedAt}</div>
    </li>
  `).join('');

  return `
    <div class="card card-custom p-3">
      <h6 class="mb-2">Zuletzt hinzugefügte Personen</h6>
      <ul class="list-group list-group-flush">${items}</ul>
    </div>
  `;
}

function renderRecentGifts() {
  const gifts = mockGifts.slice(0, 5);
  if (!gifts.length) {
    return `
      <div class="card card-custom p-3 text-center text-muted">
        <i class="bi bi-gift" style="font-size:2rem"></i>
        <h6 class="mt-2">Keine Geschenkideen</h6>
        <p class="small mb-0">Füge Geschenkideen hinzu, um sie hier anzuzeigen.</p>
      </div>
    `;
  }

  const items = gifts.map(g => `
    <li class="list-group-item d-flex justify-content-between align-items-center">
      <div>${g.title}</div>
      <div class="small text-muted">${g.addedAt}</div>
    </li>
  `).join('');

  return `
    <div class="card card-custom p-3">
      <h6 class="mb-2">Zuletzt hinzugefügte Geschenke</h6>
      <ul class="list-group list-group-flush">${items}</ul>
    </div>
  `;
}

// --- Quick action event handlers ---
let quickActionListeners = [];

function registerQuickActionListeners(container) {
  container.querySelectorAll('[data-action]').forEach(btn => {
    const action = btn.getAttribute('data-action');
    const handler = (e) => {
      e.preventDefault();
      switch (action) {
        case 'add-person':
          alert('TODO: Öffne Modal zum Hinzufügen einer Person');
          break;
        case 'add-occasion':
          alert('TODO: Öffne Modal zum Anlegen eines Anlasses');
          break;
        case 'add-gift':
          alert('TODO: Öffne Modal zum Hinzufügen einer Geschenkidee');
          break;
        case 'import-sample':
          alert('TODO: Importiere Beispieldaten (UI-only)');
          break;
      }
    };
    btn.addEventListener('click', handler);
    quickActionListeners.push({ element: btn, handler });
  });
}

// --- Public API ---

export function render(container, ctx) {
  // Reset to default welcome message
  const welcomeBox = document.querySelector('.dashboard-welcome');
  if (welcomeBox) {
    const nameDisplay = ctx.userLabel.split('@')[0];
    welcomeBox.innerHTML = `<h1>Willkommen zurück, <span id="welcomeName">${nameDisplay}</span>!</h1>`;
  }

  // Build dashboard layout
  const kpis = renderKpis();
  const upcoming = renderUpcomingOccasions();
  const quick = renderQuickActions();
  const recentPersons = renderRecentPersons();
  const recentGifts = renderRecentGifts();

  container.innerHTML = `
    <div class="container-fluid">
      <!-- Row 1: KPI Cards -->
      <div class="row g-3 mb-4">${kpis}</div>

      <!-- Row 2: Upcoming / Quick Actions -->
      <div class="row g-3 mb-4">
        <div class="col-12 col-lg-7">${upcoming}</div>
        <div class="col-12 col-lg-5">${quick}</div>
      </div>

      <!-- Row 3: Recent Persons / Gifts -->
      <div class="row g-3">
        <div class="col-12 col-md-6">${recentPersons}</div>
        <div class="col-12 col-md-6">${recentGifts}</div>
      </div>
    </div>
  `;

  // Attach quick action listeners
  registerQuickActionListeners(container);
}

export function destroy() {
  // Clean up event listeners
  quickActionListeners.forEach(({ element, handler }) => {
    element.removeEventListener('click', handler);
  });
  quickActionListeners = [];
}
