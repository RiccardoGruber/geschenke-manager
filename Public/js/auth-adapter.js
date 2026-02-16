/**
 * auth-adapter.js
 * -------------------------------------------------------
 * Ziel: Auth-Logik zentral kapseln.
 * Vorteil: Das Frontend (Login-UI, Guard, Logout) bleibt gleich,
 * selbst wenn später von "UI-Login" auf "Firebase Auth" umgestellt wird.
 */

// Firebase-Auth Ergänzungen
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { auth } from './firebase-config.js';

export const USE_FIREBASE_AUTH = true; 

// Schlüssel-Namen für Storage, damit alles konsistent bleibt.
const KEY_LOGIN = "uiLoggedIn";
const KEY_USER = "uiUser";

/**
 * @deprecated Use isAuthed() instead when USE_FIREBASE_AUTH=true
 * Prüft, ob laut UI-Status jemand "eingeloggt" ist.
 * (Frontend-Only, KEIN echtes Security-Feature.)
 */
export function isLoggedIn() {
  return sessionStorage.getItem(KEY_LOGIN) === "1";
}

/**
 * @deprecated Internal function, do not use directly
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
 * @deprecated Use getUserLabelUnified() instead when USE_FIREBASE_AUTH=true
 * Gibt den aktuell "eingeloggten" User-Label zurück (nur UI-Anzeige).
 */
export function getUserLabel() {
  return sessionStorage.getItem(KEY_USER) || "";
}

/**
 * @deprecated Use loginUnified() instead
 * Legacy UI-Login mit Dummy-Credentials (nur für Fallback)
 */
export async function login(email, password, remember = false) {
  // Legacy fallback - nur wenn USE_FIREBASE_AUTH=false
  console.warn('Deprecated: login() called. Use loginUnified() instead.');
  
  // Minimal fallback für Entwicklung
  const allowed = [
    { email: "dev@local.test", password: "dev123" }
  ];
  
  const ok = allowed.some((u) => u.email === email && u.password === password);
  if (!ok) return false;
  
  setLoggedIn(true, email);
  return true;
}

/**
 * @deprecated Use logoutUnified() instead
 * Legacy UI-Logout
 */
export async function logout() {
  console.warn('Deprecated: logout() called. Use logoutUnified() instead.');
  
  // Direkte Implementierung - KEIN Aufruf von logoutUnified() um Loop zu vermeiden
  setLoggedIn(false);
}

/**
 * Firebase-spezifische Helfer
 * -------------------------------------------------------
 * Unified helpers that respect `USE_FIREBASE_AUTH` flag.
 * - waitForUserOnce(): wartet je nach Flag auf Firebase user oder liefert UI-Pseudo-User
 * - isAuthed(): boolean, je nach Flag
 * - getUserLabelUnified(): lesbarer Label
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

export function isAuthed() {
  if (USE_FIREBASE_AUTH) return !!auth.currentUser;
  return isLoggedIn();
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
  
  // Legacy UI logout - Direkte Implementierung
  setLoggedIn(false);
}