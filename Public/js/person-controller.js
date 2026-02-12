/**
 * person-controller.js
 * -------------------------------------------------------
 * Verbindet Service mit UI (dev.html).
 * Wartet auf Auth-Status, bevor Personen geladen werden.
 */

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { auth } from "./firebase-config.js";

import {
  createPerson,
  listPersons,
  updatePerson,
  deletePerson
} from "./person-service.js";

const form = document.getElementById("personForm");
const listContainer = document.getElementById("personsList");

let editId = null;

/**
 * UI aktiv/deaktiv
 */
function setUiEnabled(enabled) {
  if (!form) return;
  Array.from(form.elements).forEach(el => (el.disabled = !enabled));
}

/**
 * Liste rendern
 */
async function renderPersons() {
  if (!listContainer) return;

  listContainer.innerHTML = `<div class="text-muted">Lade Personen...</div>`;

  try {
    const persons = await listPersons();
    listContainer.innerHTML = "";

    if (!persons.length) {
      listContainer.innerHTML = `<div class="text-muted">Keine Personen vorhanden.</div>`;
      return;
    }

    persons.forEach(p => {
      const item = document.createElement("div");
      item.className = "card p-3 mb-2";

      item.innerHTML = `
        <strong>${p.name ?? "-"}</strong><br>
        Geburtstag: ${p.birthday || "-"}<br>
        Info: ${p.info || "-"}
        <div class="mt-2">
          <button type="button" class="btn btn-sm btn-warning me-2 edit-btn">Bearbeiten</button>
          <button type="button" class="btn btn-sm btn-danger delete-btn">Löschen</button>
        </div>
      `;

      item.querySelector(".edit-btn").addEventListener("click", () => {
        editId = p.id;
        form.name.value = p.name || "";
        form.birthday.value = p.birthday || "";
        form.info.value = p.info || "";
      });

      item.querySelector(".delete-btn").addEventListener("click", async () => {
        try {
          await deletePerson(p.id);
          await renderPersons();
        } catch (err) {
          console.error(err);
          alert("Fehler beim Löschen.");
        }
      });

      listContainer.appendChild(item);
    });
  } catch (err) {
    console.error(err);

    // Wenn nicht eingeloggt:
    if (String(err?.message || "").includes("Kein eingeloggter Benutzer")) {
      setUiEnabled(false);
      listContainer.innerHTML = `
        <div class="alert alert-warning">
          Du bist nicht eingeloggt. Bitte zuerst einloggen.
        </div>
      `;
      return;
    }

    listContainer.innerHTML = `<div class="alert alert-danger">Fehler beim Laden der Personen.</div>`;
  }
}

/**
 * Formular-Submit
 */
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const data = {
    name: form.name.value,
    birthday: form.birthday.value,
    info: form.info.value
  };

  try {
    if (editId) {
      await updatePerson(editId, data);
      editId = null;
    } else {
      await createPerson(data);
    }

    form.reset();
    await renderPersons();
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
  renderPersons();
});
