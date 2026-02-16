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

// Firebase-Auth Ergänzungen
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { auth } from './firebase-config.js';

// Feature-Flag: morgen auf true setzen, um Firebase-Auth strikt zu verwenden
export const USE_FIREBASE_AUTH = false; // <-- flip to true when switching to Firebase auth

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

/**
 * Firebase-spezifische Helfer
 * -------------------------------------------------------
 * Die vorhandenen UI-Funktionen bleiben erhalten (isLoggedIn/login/logout),
 * da sie aktuell das clientseitige UI-Verhalten steuern. Zusätzliche
 * Funktionen hier ermöglichen die echte Authentifizierung mit Firebase
 * ohne die bisherigen Aufrufe zu zerstören.
 */

// Wartet einmalig auf den aktuellen Firebase-User (unsub danach)
/**
 * Unified helpers that respect `USE_FIREBASE_AUTH` flag.
 * - waitForUserOnce(): wartet je nach Flag auf Firebase user oder liefert UI-Pseudo-User
 * - isAuthed(): boolean, je nach Flag
 * - getUserLabel(): lesbarer Label
 * - loginUnified(): Login via UI oder Firebase
 * - logoutUnified(): Logout via UI oder Firebase
 */

export async function waitForUserOnce() {
  if (USE_FIREBASE_AUTH) {
    return new Promise((resolve) => {
      const unsub = onAuthStateChanged(auth, (user) => {
        unsub();
        resolve(user);
      });
    });
  }

  // UI-Mode: return pseudo-user when session indicates logged in
  if (isLoggedIn()) {
    return { uid: 'ui', email: getUserLabel() };
  }
  return null;
}

export async function isAuthedAsync() {
  const u = await waitForUserOnce();
  return !!u;
}


export function getUserLabelUnified() {
  if (USE_FIREBASE_AUTH) return auth.currentUser ? (auth.currentUser.email || auth.currentUser.uid) : '';
  return getUserLabel();
}

export async function loginUnified(email, password, remember = false) {
  if (USE_FIREBASE_AUTH) {
    // Firebase login
    const res = await signInWithEmailAndPassword(auth, email, password);
    return res.user ?? null;
  }

  // UI fallback
  const ok = await login(email, password, remember);
  return ok ? { uid: 'ui', email } : null;
}

export async function logoutUnified() {
  if (USE_FIREBASE_AUTH) {
    await signOut(auth);
    return;
  }
  await logout();
}
