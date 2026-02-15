/**
 * gifts-section.js
 * -------------------------------------------------------
 * Geschenke-Sektion
 * Verwaltet die Anzeige und Bearbeitung von Geschenken
 */

// Helper: Update page header
function setPageHeader(title, description) {
  const welcomeBox = document.querySelector('.dashboard-welcome');
  if (welcomeBox) {
    welcomeBox.innerHTML = `
      <h3>${title}</h3>
      <p class="text-muted mb-0">${description}</p>
    `;
  }
}

export function render(container, ctx) {
  // Update page header
  setPageHeader('Geschenkideen sammeln', 'Sammle Ideen für Geschenke zu anstehenden Anlässen. Hier kannst du für jede Person personalisierte Vorschläge speichern.');

  container.innerHTML = `
    <div class="text-center">
      <i class="bi bi-gift" style="font-size: 3rem; color: #f39c12; margin-bottom: 1rem;"></i>
      <h5>Geschenke</h5>
      <p class="text-muted">Diese Funktion kommt bald...</p>
      <button class="btn btn-primary mt-3" disabled>
        <i class="bi bi-plus-circle"></i> Geschenk hinzufügen (In Arbeit)
      </button>
    </div>
  `;
}

export function destroy() {
  // No event listeners to clean up
}
