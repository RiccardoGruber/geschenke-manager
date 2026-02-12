/**
 * occasion-controller.js
 * -------------------------------------------------------
 * Verbindet Service mit UI (dev-occasions.html).
 * Wartet auf Auth-Status, bevor Anlässe geladen werden.
 */

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { auth } from "./firebase-config.js";

import {
  ensureDefaultOccasions,
  createOccasion,
  listOccasions,
  updateOccasion,
  deleteOccasion
} from "./occasion-service.js";

const form = document.getElementById("occasionForm");
const listContainer = document.getElementById("occasionsList");

let editId = null;

/**
 * UI aktiv/deaktiv
 */
function setUiEnabled(enabled) {
  if (!form) return;
  Array.from(form.elements).forEach((el) => (el.disabled = !enabled));
}

/**
 * Liste rendern
 */
async function renderOccasions() {
  if (!listContainer) return;

  listContainer.innerHTML = `<div class="text-muted">Lade Anlässe...</div>`;

  try {
    // Defaults sicherstellen (Geburtstag/Weihnachten)
    await ensureDefaultOccasions();

    const occasions = await listOccasions();
    listContainer.innerHTML = "";

    if (!occasions.length) {
      listContainer.innerHTML = `<div class="text-muted">Keine Anlässe vorhanden.</div>`;
      return;
    }

    occasions.forEach((o) => {
      const item = document.createElement("div");
      item.className = "card p-3 mb-2";

      const typeLabel = o.type === "fixed" ? "Fest" : "Frei";
      const activeLabel = o.isActive === false ? " (inaktiv)" : "";

      item.innerHTML = `
        <div class="d-flex justify-content-between align-items-start">
          <div>
            <strong>${o.name ?? "-"}</strong>${activeLabel}<br>
            <span class="text-muted small">Typ: ${typeLabel}</span>
          </div>
          <div class="d-flex gap-2">
            <button type="button" class="btn btn-sm btn-outline-secondary toggle-btn">
              ${o.isActive === false ? "Aktivieren" : "Deaktivieren"}
            </button>
            <button type="button" class="btn btn-sm btn-warning edit-btn">Bearbeiten</button>
            <button type="button" class="btn btn-sm btn-danger delete-btn">Löschen</button>
          </div>
        </div>
      `;

      // Toggle active
      item.querySelector(".toggle-btn").addEventListener("click", async () => {
        try {
          const newState = o.isActive === false;
          await updateOccasion(o.id, { isActive: newState });
          await renderOccasions();
        } catch (err) {
          console.error(err);
          alert("Fehler beim Ändern des Status: " + (err?.message || err));
        }
      });

      // Edit
      item.querySelector(".edit-btn").addEventListener("click", () => {
        editId = o.id;
        form.name.value = o.name || "";
      });

      // Delete (optional: fixed-Anlässe nicht löschen lassen)
      item.querySelector(".delete-btn").addEventListener("click", async () => {
        try {
          if (o.type === "fixed") {
            alert("Feste Anlässe können nicht gelöscht werden.");
            return;
          }
          await deleteOccasion(o.id);
          await renderOccasions();
        } catch (err) {
          console.error(err);
          alert("Fehler beim Löschen.");
        }
      });

      listContainer.appendChild(item);
    });
  } catch (err) {
    console.error(err);

    if (String(err?.message || "").includes("Kein eingeloggter Benutzer")) {
      setUiEnabled(false);
      listContainer.innerHTML = `
        <div class="alert alert-warning">
          Du bist nicht eingeloggt. Bitte zuerst einloggen.
        </div>
      `;
      return;
    }

    listContainer.innerHTML = `<div class="alert alert-danger">Fehler beim Laden der Anlässe.</div>`;
  }
}

/**
 * Formular-Submit
 */
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const data = {
    name: form.name.value
  };

  try {
    if (editId) {
      await updateOccasion(editId, data);
      editId = null;
    } else {
      await createOccasion(data);
    }

    form.reset();
    await renderOccasions();
  } catch (err) {
    console.error(err);
    alert(err?.message || "Fehler beim Speichern.");
  }
});

/**
 * Start: Auth-Gate -> erst rendern wenn User vorhanden
 */
onAuthStateChanged(auth, (user) => {
  if (!user) {
    setUiEnabled(false);
    listContainer.innerHTML = `
      <div class="alert alert-warning">
        Du bist nicht eingeloggt. Bitte zuerst einloggen.
      </div>
    `;
    return;
  }

  setUiEnabled(true);
  renderOccasions();
});
