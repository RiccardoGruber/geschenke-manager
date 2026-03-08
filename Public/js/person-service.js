/**
 * person-service.js
 * -------------------------------------------------------
 * CRUD service for persons.
 * Stores data under:
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
  updateDoc,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

import { auth, db } from "./firebase-config.js";

/**
 * Waits once until Firebase Auth reliably knows the user state.
 * (auth.currentUser is often briefly null during initial load)
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
 * Gets the current UID or throws an error (after auth is ready).
 */
export async function getUidOrThrow() {
  const user = auth.currentUser ?? (await waitForAuthReadyOnce());
  if (!user) throw new Error("Kein eingeloggter Benutzer.");
  return user.uid;
}

/**
 * Create person
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
    updatedAt: serverTimestamp(),
  });

  return docRef.id;
}

/**
 * Load persons
 */
export async function listPersons() {
  const uid = await getUidOrThrow();
  const ref = collection(db, "users", uid, "persons");
  const q = query(ref, orderBy("name"));
  const snap = await getDocs(q);

  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));
}

/**
 * Edit person
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
    updatedAt: serverTimestamp(),
  });
}

/**
 * Delete person
 */
export async function deletePerson(id) {
  if (!id) throw new Error("ID fehlt.");

  const uid = await getUidOrThrow();
  const ref = doc(db, "users", uid, "persons", id);
  await deleteDoc(ref);
}

