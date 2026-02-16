/**
 * auth-adapter.legacy.js
 * -------------------------------------------------------
 * LEGACY / DEPRECATED
 *
 * Enthält den alten UI-/SessionStorage-basierten Auth-Code (Mock/Demo),
 * der vor der Firebase-Auth-Integration verwendet wurde.
 *
 * Status:
 * - Nicht mehr im Produktiv-Flow genutzt (Firebase Auth ist Standard).
 * - Nur als Referenz/Notfall-Fallback für Entwicklung/Debugging behalten.
 *
 * Nutzung:
 * - NICHT in produktiven Seiten importieren.
 * - Falls benötigt, nur bewusst und temporär einbinden (z.B. für Offline-Demos).
 *
 * @deprecated Seit Umstellung auf Firebase Auth. Wird in einer späteren Aufräumphase entfernt.
 */

/**
 * Prüft, ob laut UI-Status jemand "eingeloggt" ist.
 * (Frontend-Only, KEIN echtes Security-Feature.)
 */
export function isLoggedIn() {
  return sessionStorage.getItem(KEY_LOGIN) === "1";
}

/**
 * Speichert einen UI-Login-Zustand.
 * @param {boolean} flag true = eingeloggt, false = ausgeloggt
 * @param {string} userLabel z.B. E-Mail oder Username (nur fürs UI)
 */
export function setLoggedIn(flag, userLabel = "") {
  sessionStorage.setItem(KEY_LOGIN, flag ? "1" : "0");
  if (flag) sessionStorage.setItem(KEY_USER, userLabel);
  else sessionStorage.removeItem(KEY_USER);
}

/**
 * Gibt den aktuell "eingeloggten" User-Label zurück (nur UI-Anzeige).
 */
export function getUserLabel() {
  return sessionStorage.getItem(KEY_USER) || "";
}

/**
 * UI-Login: Prüft Dummy-Credentials.
 * Später ersetzt man den Inhalt dieser Funktion durch Firebase Auth:
 * signInWithEmailAndPassword(auth, email, password)
 */
export async function login(email, password, remember = false) {
  // Beispiel-Accounts (nur für Entwicklung). Nicht ins finale Repo als echte Passwörter.
  const allowed = [
    { email: "tutor@example.com", password: "tutor123" },
    { email: "demo@example.com", password: "demo123" }
  ];

  const ok = allowed.some((u) => u.email === email && u.password === password);
  if (!ok) return false;

  // "Remember" könnte später localStorage sein; aktuell bleibt es sessionbasiert simpel.
  setLoggedIn(true, email);
  return true;
}

/**
 * UI-Logout.
 * Später: Firebase signOut(auth)
 */
export async function logout() {
  setLoggedIn(false);
}
