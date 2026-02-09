/**
 * auth-adapter.js
 * -------------------------------------------------------
 * Ziel: Auth-Logik zentral kapseln.
 * Vorteil: Das Frontend (Login-UI, Guard, Logout) bleibt gleich,
 * selbst wenn später von "UI-Login" auf "Firebase Auth" umgestellt wird.
 *
 * Aktueller Stand: "UI-Login" (kein echter Schutz).
 * Später: login() / logout() / isLoggedIn() kann auf Firebase Auth wechseln.
 */

// Schlüssel-Namen für Storage, damit alles konsistent bleibt.
const KEY_LOGIN = "uiLoggedIn";
const KEY_USER = "uiUser";

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
