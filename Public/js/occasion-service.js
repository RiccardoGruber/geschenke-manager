/**
 * occasion-service.js
 * -------------------------------------------------------
 * CRUD-Service für Anlässe.
 * Speichert Daten unter:
 * users/{uid}/occasions/{occasionId}
 *
 * Default-Anlässe:
 * - Geburtstag (fixed)
 * - Weihnachten (fixed)
 */

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

import { auth, db } from "./firebase-config.js";

/**
 * Wartet einmalig, bis Firebase Auth den User-Zustand sicher kennt.
 * (auth.currentUser ist beim initialen Laden oft kurz null)
 */
function waitForAuthReadyOnce() {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      resolve(user);
    });
  });
}

/**
 * Holt aktuelle UID oder wirft Fehler (nachdem Auth ready ist).
 */
export async function getUidOrThrow() {
  const user = auth.currentUser ?? (await waitForAuthReadyOnce());
  if (!user) throw new Error("Kein eingeloggter Benutzer.");
  return user.uid;
}

/**
 * Interne Helper: Referenz auf user-spezifische Occasion-Collection
 */
async function occasionsColRef() {
  const uid = await getUidOrThrow();
  return collection(db, "users", uid, "occasions");
}

/**
 * Default-Anlässe sicherstellen (einmalig, falls noch nicht vorhanden).
 */
export async function ensureDefaultOccasions() {
  const ref = await occasionsColRef();

  // Prüfen, ob es bereits fixed-Anlässe gibt (oder überhaupt Daten)
  const q = query(ref, where("type", "==", "fixed"), limit(1));
  const snap = await getDocs(q);

  if (!snap.empty) return; // defaults existieren bereits

  // Default-Anlässe anlegen
  const defaults = [
    { name: "Geburtstag", type: "fixed", isActive: true },
    { name: "Weihnachten", type: "fixed", isActive: true }
  ];

  for (const d of defaults) {
    await addDoc(ref, {
      ...d,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }
}

/**
 * Anlass anlegen (frei / custom)
 */
export async function createOccasion({ name }) {
  if (!name?.trim()) throw new Error("Name ist Pflicht.");

  const ref = await occasionsColRef();

  const docRef = await addDoc(ref, {
    name: name.trim(),
    type: "custom",
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  return docRef.id;
}

/**
 * Anlässe laden (sortiert)
 */
export async function listOccasions() {
  const ref = await occasionsColRef();
  const snap = await getDocs(ref);
  const items = snap.docs.map((d) => ({
    id: d.id,
    ...d.data()
  }));
  items.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "de"));
  return items;
}

/**
 * Anlass bearbeiten
 */
export async function updateOccasion(id, { name, isActive }) {
  if (!id) throw new Error("ID fehlt.");
  if (name !== undefined && !String(name).trim()) throw new Error("Name ist Pflicht.");

  const uid = await getUidOrThrow();
  const ref = doc(db, "users", uid, "occasions", id);

  const patch = {
    updatedAt: serverTimestamp()
  };

  if (name !== undefined) patch.name = String(name).trim();
  if (isActive !== undefined) patch.isActive = !!isActive;

  await updateDoc(ref, patch);
}

/**
 * Anlass löschen
 * Hinweis: Optional später Systemverhalten definieren, wenn verknüpfte Geschenkideen existieren.
 */
export async function deleteOccasion(id) {
  if (!id) throw new Error("ID fehlt.");

  const uid = await getUidOrThrow();
  const ref = doc(db, "users", uid, "occasions", id);
  await deleteDoc(ref);
}
