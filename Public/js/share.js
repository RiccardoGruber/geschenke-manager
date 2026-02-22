import "./firebase-config.js";
import { resolveShareToken } from "./share-service.js";

const stateBox = document.getElementById("stateBox");
const headerTitle = document.getElementById("headerTitle");
const tbody = document.getElementById("ideasTable").querySelector("tbody");

function setState(type, html) {
  stateBox.className = "alert alert-" + type;
  stateBox.innerHTML = html;
}

function clearTable() {
  tbody.innerHTML = `<tr><td colspan="4" class="text-muted">Keine Daten vorhanden.</td></tr>`;
}

function render(items) {
  if (!items || items.length === 0) return clearTable();

  tbody.innerHTML = items.map(i => `
    <tr>
      <td>${i.type || "—"}</td>
      <td>${i.occasionName || "—"}</td>
      <td><span class="badge bg-light text-dark">${i.status || "—"}</span></td>
      <td>${String(i.content || "").slice(0, 240)}</td>
    </tr>
  `).join("");
}

function getTokenFromUrl() {
  const url = new URL(window.location.href);
  return (url.searchParams.get("t") || "").trim();
}

(async () => {
  try {
    const token = getTokenFromUrl();
    if (!token) {
      setState("warning", '<i class="bi bi-exclamation-triangle"></i> Link ungültig: Token fehlt.');
      clearTable();
      return;
    }

    const meta = await resolveShareToken(token);

    // TF-47: Inhalte sichtbar
    if (meta.kind === "giftIdeasByPerson") {
      headerTitle.textContent = `Geschenkideen für: ${meta.personName || meta.personId}`;
      render(meta.items || []);
      setState("success", '<i class="bi bi-check-circle"></i> Inhalte geladen.');
      return;
    }

    if (meta.kind === "giftIdea") {
      headerTitle.textContent = `Geteilte Geschenkidee für: ${meta.personName || meta.personId}`;
      render(meta.item ? [meta.item] : []);
      setState("success", '<i class="bi bi-check-circle"></i> Inhalt geladen.');
      return;
    }

    // unbekannter Linktyp
    setState("warning", '<i class="bi bi-exclamation-triangle"></i> Link-Typ wird nicht unterstützt.');
    clearTable();

  } catch (e) {
    console.error(e);

    // TF-48: saubere Fehlermeldung
    const msg = e?.message || String(e);
    setState("warning", `<i class="bi bi-exclamation-triangle"></i> ${msg}`);
    clearTable();
  }
})();