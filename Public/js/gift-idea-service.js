/**
 * gift-idea-service.js
 * -------------------------------------------------------
 * CRUD-Service für Geschenkideen.
 * users/{uid}/giftIdeas/{ideaId}
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

async function ideasColRef() {
  const uid = await getUidOrThrow();
  return collection(db, "users", uid, "giftIdeas");
}

const TYPES = ["text", "link", "image"];
const STATUSES = ["offen", "besorgt", "erledigt"];

function isValidType(type) {
  return TYPES.includes(type);
}

function isValidStatus(status) {
  return STATUSES.includes(status);
}

function normalizeString(v) {
  return String(v ?? "").trim();
}

function requireNonEmpty(label, v) {
  const s = normalizeString(v);
  if (!s) throw new Error(`${label} ist Pflicht.`);
  return s;
}

function validateContentByType(type, content) {
  const c = requireNonEmpty("Inhalt", content);
  if ((type === "link" || type === "image") && !/^https?:\/\/.+/i.test(c)) {
    throw new Error("Bitte eine gültige URL angeben (http/https).");
  }
  return c;
}

// ---------- CRUD ----------
export async function createGiftIdea({
  personId,
  personName,
  occasionId = "",
  occasionName = "",
  type = "text",
  content,
  status = "offen"
}) {
  const pid = requireNonEmpty("personId", personId);
  const pname = requireNonEmpty("personName", personName);

  if (!isValidType(type)) throw new Error("Ungültiger Typ.");
  if (!isValidStatus(status)) throw new Error("Ungültiger Status.");

  const ref = await ideasColRef();

  const docRef = await addDoc(ref, {
    personId: pid,
    personName: pname,
    occasionId: normalizeString(occasionId),
    occasionName: normalizeString(occasionName),
    type,
    content: validateContentByType(type, content),
    status,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  return docRef.id;
}

export async function getGiftIdea(id) {
  if (!id) throw new Error("ID fehlt.");
  const uid = await getUidOrThrow();
  const ref = doc(db, "users", uid, "giftIdeas", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function listGiftIdeas() {
  const ref = await ideasColRef();
  const q = query(ref, orderBy("updatedAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listGiftIdeasByPerson(personId) {
  const pid = requireNonEmpty("personId", personId);
  const ref = await ideasColRef();
  const q = query(ref, where("personId", "==", pid));
  const snap = await getDocs(q);
  const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  // simple stable sort: offen zuerst
  items.sort((a, b) => normalizeString(a.status).localeCompare(normalizeString(b.status), "de"));
  return items;
}

export async function updateGiftIdea(id, patch = {}) {
  if (!id) throw new Error("ID fehlt.");
  const uid = await getUidOrThrow();
  const ref = doc(db, "users", uid, "giftIdeas", id);

  const out = { updatedAt: serverTimestamp() };

  if (patch.personId !== undefined) out.personId = requireNonEmpty("personId", patch.personId);
  if (patch.personName !== undefined) out.personName = requireNonEmpty("personName", patch.personName);
  if (patch.occasionId !== undefined) out.occasionId = normalizeString(patch.occasionId);
  if (patch.occasionName !== undefined) out.occasionName = normalizeString(patch.occasionName);

  if (patch.type !== undefined) {
    if (!isValidType(patch.type)) throw new Error("Ungültiger Typ.");
    out.type = patch.type;
  }

  if (patch.content !== undefined) {
    const effectiveType = out.type ?? patch.type ?? "text";
    out.content = validateContentByType(effectiveType, patch.content);
  }

  if (patch.status !== undefined) {
    if (!isValidStatus(patch.status)) throw new Error("Ungültiger Status.");
    out.status = patch.status;
  }

  await updateDoc(ref, out);
}

export async function setGiftIdeaStatus(id, status) {
  if (!isValidStatus(status)) throw new Error("Ungültiger Status.");
  await updateGiftIdea(id, { status });
}

export async function deleteGiftIdea(id) {
  if (!id) throw new Error("ID fehlt.");
  const uid = await getUidOrThrow();
  const ref = doc(db, "users", uid, "giftIdeas", id);
  await deleteDoc(ref);
}

/**
 * Helper für TF-06: Existieren Geschenkideen für Person?
 */
export async function hasGiftIdeasByPerson(personId) {
  const pid = requireNonEmpty("personId", personId);
  const ref = await ideasColRef();
  const q = query(ref, where("personId", "==", pid), limit(1));
  const snap = await getDocs(q);
  return !snap.empty;
}
/**
 * Helper für TF-19: Existieren Geschenkideen für Anlass?
 */
export async function hasGiftIdeasByOccasion(occasionId) {
  const oid = requireNonEmpty("occasionId", occasionId);
  const ref = await ideasColRef();
  const q = query(ref, where("occasionId", "==", oid), limit(1));
  const snap = await getDocs(q);
  return !snap.empty;
}
