/**
 * login.js
 * -------------------------------------------------------
 * Steuert das Verhalten der Login-Seite.
 * Wichtig: Hier wird (noch) kein Firebase Auth verwendet.
 * Später kann man auth-adapter.js austauschen (ohne UI neu zu schreiben).
 */

import { login, isLoggedIn } from "./auth-adapter.js";

// Wenn bereits eingeloggt, direkt zur App weiterleiten
if (isLoggedIn()) {
  window.location.href = "./dashboard.html";
}

const form = document.getElementById("loginForm");
const errorBox = document.getElementById("loginError");
const btn = document.getElementById("loginBtn");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  // UI-Feedback: Fehler ausblenden & Button deaktivieren
  errorBox.classList.add("d-none");
  btn.disabled = true;

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const remember = document.getElementById("remember").checked;

  try {
    const ok = await login(email, password, remember);

    if (!ok) {
      // Falsche Credentials -> Fehlermeldung zeigen
      errorBox.classList.remove("d-none");
      btn.disabled = false;
      return;
    }

    // Erfolg -> zur App weiterleiten
    window.location.href = "./dashboard.html";
  } catch (err) {
    // Unerwarteter Fehler (z.B. später bei Firebase)
    console.error(err);
    errorBox.classList.remove("d-none");
    btn.disabled = false;
  }
});
