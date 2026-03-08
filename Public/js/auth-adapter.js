/**
 * auth-adapter.js
 * -------------------------------------------------------
 */

import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { auth } from "./firebase-config.js";

export const USE_FIREBASE_AUTH = true;

const KEY_LOGIN = "uiLoggedIn";
const KEY_USER = "uiUser";

export function waitForUserOnce() {
  if (USE_FIREBASE_AUTH) {
    return new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        unsubscribe();
        resolve(user);
      });
    });
  }

  // UI-Mode
  if (localStorage.getItem(KEY_LOGIN) === "true") {
    return Promise.resolve({
      uid: "ui",
      email: localStorage.getItem(KEY_USER),
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
      ? auth.currentUser.email || auth.currentUser.uid
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
  return ok ? { uid: "ui", email } : null;
}

export async function logoutUnified() {
  if (USE_FIREBASE_AUTH) {
    await signOut(auth);
    return;
  }
  await logout();
}
