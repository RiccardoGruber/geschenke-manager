/**
 * login.js
 * Steuert das Verhalten der Login-Seite.
 */

import { loginUnified, isAuthed, waitForUserOnce } from "./auth-adapter.js";

const form = document.getElementById("loginForm");
const errorBox = document.getElementById("loginError");
const btn = document.getElementById("loginBtn");

// If already considered authed, redirect to dashboard
if (isAuthed()) {
  window.location.href = "./dashboard.html";
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  errorBox.classList.add("d-none");
  btn.disabled = true;

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const remember = document.getElementById("remember").checked;

  try {
    const user = await loginUnified(email, password, remember);
    if (!user) {
      errorBox.classList.remove("d-none");
      btn.disabled = false;
      return;
    }

    // Success
    window.location.href = "./dashboard.html";
  } catch (err) {
    console.error('Login failed', err);
    errorBox.textContent = 'Login fehlgeschlagen: ' + (err?.message || 'Unbekannter Fehler');
    errorBox.classList.remove('d-none');
    btn.disabled = false;
  }
});