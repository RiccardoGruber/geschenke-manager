/**
 * settings-section.js
 * -------------------------------------------------------
 * Frontend-Einstellungen (lokal im localStorage gespeichert)
 *
 * Einstellungen:
 *   displayName    – Anzeigename im Profil-Dropdown
 *   defaultSection – Standard-Startseite nach Login
 *   reminderDays   – Erinnerung X Tage vor einem Anlass
 */

export function render(container, ctx) {
  ctx.setPageHeader("Einstellungen", "");

  const displayName = localStorage.getItem("displayName") || "";
  const defaultSection = localStorage.getItem("defaultSection") || "dashboard";
  const reminderDays = localStorage.getItem("reminderDays") || "7";

  container.innerHTML = `
    <div class="container-fluid">
      <div id="settingsMessage"></div>
      <div class="row g-3">

        <div class="col-12 col-md-4">
          <div class="card card-custom p-3">
            <h6>Benutzer</h6>
            <div class="mb-3">
              <label for="settingDisplayName" class="form-label">Anzeigename</label>
              <input type="text" id="settingDisplayName" class="form-control" value="${displayName}">
            </div>
            <button class="btn btn-primary" id="saveDisplayNameBtn">Speichern</button>
          </div>
        </div>

        <div class="col-12 col-md-4">
          <div class="card card-custom p-3">
            <h6>Navigation</h6>
            <div class="mb-3">
              <label for="settingDefaultSection" class="form-label">Standard-Startseite</label>
              <select id="settingDefaultSection" class="form-select">
                <option value="dashboard" ${defaultSection === "dashboard" ? "selected" : ""}>Dashboard</option>
                <option value="persons"   ${defaultSection === "persons" ? "selected" : ""}>Personen</option>
                <option value="occasions" ${defaultSection === "occasions" ? "selected" : ""}>Anlässe</option>
                <option value="gifts"     ${defaultSection === "gifts" ? "selected" : ""}>Geschenke</option>
              </select>
            </div>
          </div>
        </div>

        <div class="col-12 col-md-4">
          <div class="card card-custom p-3">
            <h6>Erinnerungen</h6>
            <div class="mb-3">
              <label for="settingReminderDays" class="form-label">Erinnerung vor (Tagen)</label>
              <input type="number" id="settingReminderDays" min="0" max="365"
                     class="form-control" value="${reminderDays}">
            </div>
            <button class="btn btn-primary" id="saveReminderDaysBtn">Speichern</button>
          </div>
        </div>

      </div>
    </div>
  `;

  // Feedback-Box (3 Sekunden sichtbar)
  function showSettingsMessage(msg, type = "success") {
    const box = document.getElementById("settingsMessage");
    if (!box) return;
    box.innerHTML = `<div class="alert alert-${type} alert-sm" role="alert">${msg}</div>`;
    setTimeout(() => {
      box.innerHTML = "";
    }, 3000);
  }

  // Anzeigename speichern
  const saveNameBtn = document.getElementById("saveDisplayNameBtn");
  const nameInput = document.getElementById("settingDisplayName");
  if (saveNameBtn && nameInput) {
    saveNameBtn.addEventListener("click", () => {
      localStorage.setItem("displayName", nameInput.value.trim());
      if (ctx.updateProfile) ctx.updateProfile();
      showSettingsMessage("Anzeigename gespeichert");
    });
  }

  // Standard-Startseite speichern (direkt beim Wechsel)
  const defaultSelect = document.getElementById("settingDefaultSection");
  if (defaultSelect) {
    defaultSelect.addEventListener("change", (e) => {
      localStorage.setItem("defaultSection", e.target.value);
      showSettingsMessage("Startseite gespeichert");
    });
  }

  // Erinnerungstage speichern
  const saveReminderBtn = document.getElementById("saveReminderDaysBtn");
  const reminderInput = document.getElementById("settingReminderDays");
  if (saveReminderBtn && reminderInput) {
    saveReminderBtn.addEventListener("click", () => {
      const val = parseInt(reminderInput.value, 10);
      localStorage.setItem("reminderDays", String(isNaN(val) ? 0 : val));
      showSettingsMessage("Erinnerungstage gespeichert");
    });
  }
}

export function destroy() {
  // Keine persistenten Listener — nichts zu bereinigen
}
