/**
 * occasion-service.js
 * -------------------------------------------------------
 * CRUD service for occasions.
 * Stores data under:
 * users/{uid}/occasions/{occasionId}
 *
 * Default occasions:
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
  where,
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
 * Internal helper: reference to the user-specific occasion collection
 */
async function occasionsColRef() {
  const uid = await getUidOrThrow();
  return collection(db, "users", uid, "occasions");
}

/**
 * Ensure default occasions (once, if not already present).
 */
export async function ensureDefaultOccasions() {
  const ref = await occasionsColRef();

  // Check whether fixed occasions already exist (or any data at all)
  const q = query(ref, where("type", "==", "fixed"), limit(1));
  const snap = await getDocs(q);

  if (!snap.empty) return; // defaults existieren bereits

  // Create default occasions
  const defaults = [
    { name: "Geburtstag", type: "fixed", isActive: true },
    { name: "Weihnachten", type: "fixed", isActive: true },
  ];

  for (const d of defaults) {
    await addDoc(ref, {
      ...d,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

/**
 * Create occasion (free/custom)
 */
export async function createOccasion({
  name,
  date,
  person,
  type,
  info,
  isActive,
}) {
  if (!name?.trim()) throw new Error("Name ist Pflicht.");
  if (!date) throw new Error("Datum ist Pflicht.");

  const ref = await occasionsColRef();

  const payload = {
    name: name.trim(),
    date: String(date), // "YYYY-MM-DD" als String speichern (sauber fürs UI)
    person: person ? String(person).trim() : "",
    type: type === "fixed" ? "fixed" : "custom",
    info: info ? String(info).trim() : "",
    isActive: isActive !== false, // default true
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const docRef = await addDoc(ref, payload);
  return docRef.id;
}

/**
 * Load occasions (sorted)
 */
export async function listOccasions() {
  const ref = await occasionsColRef();
  const snap = await getDocs(ref);
  const items = snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));
  items.sort((a, b) =>
    String(a.name || "").localeCompare(String(b.name || ""), "de"),
  );
  return items;
}

/**
 * Edit occasion
 */
export async function updateOccasion(
  id,
  { name, date, person, type, info, isActive },
) {
  if (!id) throw new Error("ID fehlt.");
  if (name !== undefined && !String(name).trim())
    throw new Error("Name ist Pflicht.");
  if (date !== undefined && !String(date).trim())
    throw new Error("Datum ist Pflicht.");

  const uid = await getUidOrThrow();
  const ref = doc(db, "users", uid, "occasions", id);

  const patch = {
    updatedAt: serverTimestamp(),
  };

  if (name !== undefined) patch.name = String(name).trim();
  if (date !== undefined) patch.date = String(date); // "YYYY-MM-DD"
  if (person !== undefined) patch.person = String(person).trim();
  if (type !== undefined) patch.type = type === "fixed" ? "fixed" : "custom";
  if (info !== undefined) patch.info = String(info).trim();
  if (isActive !== undefined) patch.isActive = !!isActive;

  await updateDoc(ref, patch);
}

import { hasGiftIdeasByOccasion } from "./gift-idea-service.js";
import { hasGiftsByOccasion } from "./gift-service.js";

/**
 * Delete occasion (TF-19)
 * - if assignments exist -> prevent deletion
 */
export async function deleteOccasion(id) {
  if (!id) throw new Error("ID fehlt.");

  // Check dependencies
  const [hasIdeas, hasGifts] = await Promise.all([
    hasGiftIdeasByOccasion(id),
    hasGiftsByOccasion(id),
  ]);

  if (hasIdeas || hasGifts) {
    throw new Error(
      "Anlass kann nicht gelöscht werden, weil noch Geschenkideen oder Geschenke zugeordnet sind.",
    );
  }

  const uid = await getUidOrThrow();
  const ref = doc(db, "users", uid, "occasions", id);
  await deleteDoc(ref);
}

