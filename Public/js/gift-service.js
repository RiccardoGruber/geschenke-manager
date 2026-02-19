/**
 * gift-service.js
 * -------------------------------------------------------
 * CRUD-Service für Geschenke (vergangene/echte Geschenke).
 * users/{uid}/gifts/{giftId}
 */

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  limit
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { auth, db } from "./firebase-config.js";

// ---------- Auth helpers ----------
function waitForAuthReadyOnce() {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      resolve(user);
    });
  });
}

export async function getUidOrThrow() {
  const user = auth.currentUser ?? (await waitForAuthReadyOnce());
  if (!user) throw new Error("Kein eingeloggter Benutzer.");
  return user.uid;
}

async function giftsColRef() {
  const uid = await getUidOrThrow();
  return collection(db, "users", uid, "gifts");
}

const STATUSES = ["offen", "besorgt", "ueberreicht"];

function normalizeString(v) {
  return String(v ?? "").trim();
}

function requireNonEmpty(label, v) {
  const s = normalizeString(v);
  if (!s) throw new Error(`${label} ist Pflicht.`);
  return s;
}

function isValidStatus(s) {
  return STATUSES.includes(s);
}

function isValidDateYYYYMMDD(date) {
  const s = normalizeString(date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s);
  return !isNaN(d.getTime());
}

// ---------- CRUD ----------
export async function createGift({
  personId,
  personName,
  occasionId = "",
  occasionName = "",
  date,
  note = "",
  status = "offen",
  sourceIdeaId = null
}) {
  const pid = requireNonEmpty("personId", personId);
  const pname = requireNonEmpty("personName", personName);

  if (!isValidDateYYYYMMDD(date)) throw new Error("Ungültiges Datum (YYYY-MM-DD).");
  if (!isValidStatus(status)) throw new Error("Ungültiger Status.");

  const ref = await giftsColRef();

  const docRef = await addDoc(ref, {
    personId: pid,
    personName: pname,
    occasionId: normalizeString(occasionId),
    occasionName: normalizeString(occasionName),
    date: normalizeString(date),
    note: normalizeString(note),
    status,
    sourceIdeaId: sourceIdeaId ? String(sourceIdeaId) : null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  return docRef.id;
}

export async function getGift(id) {
  if (!id) throw new Error("ID fehlt.");
  const uid = await getUidOrThrow();
  const ref = doc(db, "users", uid, "gifts", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function listGifts() {
  const ref = await giftsColRef();
  const q = query(ref, orderBy("date", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listGiftsByPerson(personId) {
  const pid = requireNonEmpty("personId", personId);
  const ref = await giftsColRef();
  const q = query(ref, where("personId", "==", pid));
  const snap = await getDocs(q);
  const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  items.sort((a, b) => normalizeString(b.date).localeCompare(normalizeString(a.date)));
  return items;
}

export async function updateGift(id, patch = {}) {
  if (!id) throw new Error("ID fehlt.");
  const uid = await getUidOrThrow();
  const ref = doc(db, "users", uid, "gifts", id);

  const out = { updatedAt: serverTimestamp() };

  if (patch.personId !== undefined) out.personId = requireNonEmpty("personId", patch.personId);
  if (patch.personName !== undefined) out.personName = requireNonEmpty("personName", patch.personName);
  if (patch.occasionId !== undefined) out.occasionId = normalizeString(patch.occasionId);
  if (patch.occasionName !== undefined) out.occasionName = normalizeString(patch.occasionName);

  if (patch.date !== undefined) {
    if (!isValidDateYYYYMMDD(patch.date)) throw new Error("Ungültiges Datum (YYYY-MM-DD).");
    out.date = normalizeString(patch.date);
  }
  if (patch.note !== undefined) out.note = normalizeString(patch.note);

  if (patch.status !== undefined) {
    if (!isValidStatus(patch.status)) throw new Error("Ungültiger Status.");
    out.status = patch.status;
  }

  if (patch.sourceIdeaId !== undefined) out.sourceIdeaId = patch.sourceIdeaId ? String(patch.sourceIdeaId) : null;

  await updateDoc(ref, out);
}

export async function setGiftStatus(id, status) {
  if (!isValidStatus(status)) throw new Error("Ungültiger Status.");
  await updateGift(id, { status });
}

export async function deleteGift(id) {
  if (!id) throw new Error("ID fehlt.");
  const uid = await getUidOrThrow();
  const ref = doc(db, "users", uid, "gifts", id);
  await deleteDoc(ref);
}

/**
 * Helper für TF-06/TF-19: Existieren Geschenke für Person?
 */
export async function hasGiftsByPerson(personId) {
  const pid = requireNonEmpty("personId", personId);
  const ref = await giftsColRef();
  const q = query(ref, where("personId", "==", pid), limit(1));
  const snap = await getDocs(q);
  return !snap.empty;
}
