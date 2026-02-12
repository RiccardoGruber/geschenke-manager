/**
 * person-service.js
 * -------------------------------------------------------
 * CRUD-Service für Personen.
 * Speichert Daten unter:
 * users/{uid}/persons/{personId}
 */

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc
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
 * Person anlegen
 */
export async function createPerson({ name, birthday, info }) {
  if (!name?.trim()) throw new Error("Name ist Pflicht.");

  const uid = await getUidOrThrow();
  const ref = collection(db, "users", uid, "persons");

  const docRef = await addDoc(ref, {
    name: name.trim(),
    birthday: birthday || "",
    info: info || "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  return docRef.id;
}

/**
 * Personen laden
 */
export async function listPersons() {
  const uid = await getUidOrThrow();
  const ref = collection(db, "users", uid, "persons");
  const q = query(ref, orderBy("name"));
  const snap = await getDocs(q);

  return snap.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));
}

/**
 * Person bearbeiten
 */
export async function updatePerson(id, { name, birthday, info }) {
  if (!id) throw new Error("ID fehlt.");
  if (!name?.trim()) throw new Error("Name ist Pflicht.");

  const uid = await getUidOrThrow();
  const ref = doc(db, "users", uid, "persons", id);

  await updateDoc(ref, {
    name: name.trim(),
    birthday: birthday || "",
    info: info || "",
    updatedAt: serverTimestamp()
  });
}

/**
 * Person löschen
 */
export async function deletePerson(id) {
  if (!id) throw new Error("ID fehlt.");

  const uid = await getUidOrThrow();
  const ref = doc(db, "users", uid, "persons", id);
  await deleteDoc(ref);
}
