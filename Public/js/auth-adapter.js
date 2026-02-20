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
export const USE_FIREBASE_AUTH = true; // <-- flip to true when switching to Firebase auth

// Schlüssel-Namen für Storage, damit alles konsistent bleibt.
const KEY_LOGIN = "uiLoggedIn";
const KEY_USER = "uiUser";

// Wartet einmalig auf den aktuellen Firebase-User (unsub danach)
/**
 * Unified helpers that respect `USE_FIREBASE_AUTH` flag.
 * - waitForUserOnce(): wartet je nach Flag auf Firebase user oder liefert UI-Pseudo-User
 * - isAuthed(): boolean, je nach Flag
 * - getUserLabel(): lesbarer Label
 * - loginUnified(): Login via UI oder Firebase
 * - logoutUnified(): Logout via UI oder Firebase
 */

export function waitForUserOnce() {
  if (USE_FIREBASE_AUTH) {
    return new Promise(resolve => {
      const unsubscribe = onAuthStateChanged(auth, user => {
        unsubscribe();
        resolve(user);
      });
    });
  }

  // UI-Mode
  if (localStorage.getItem(KEY_LOGIN) === "true") {
    return Promise.resolve({
      uid: "ui",
      email: localStorage.getItem(KEY_USER)
    });
  }

  return Promise.resolve(null);
}

export function isAuthed() {
  if (USE_FIREBASE_AUTH) {
    return !!auth.currentUser;
  }
  return localStorage.getItem(KEY_LOGIN) === "true";
}

export function getUserLabelUnified() {
  if (USE_FIREBASE_AUTH) {
    return auth.currentUser
      ? (auth.currentUser.email || auth.currentUser.uid)
      : "";
  }
  return localStorage.getItem(KEY_USER) ?? "";
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
