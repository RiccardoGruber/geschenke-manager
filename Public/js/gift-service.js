/**
 * gift-service.js
 * -------------------------------------------------------
 * CRUD-Service für Geschenke.
 * Speichert Daten unter:
 * users/{uid}/gifts/{giftId}
 *
 * Erweiterung: "Vergangene Geschenke" via Feld `kind`
 * - kind: "planned" (default)  -> geplante Geschenke / aus Geschenkideen
 * - kind: "past"               -> vergangene Geschenke (Historie)
 *
 * Abwärtskompatibel:
 * - alte Dokumente ohne `kind` gelten als "planned".
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

// ---------- Model ----------
const KINDS = ["planned", "past"];
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

function isValidKind(k) {
  return KINDS.includes(k);
}

function normalizeKind(k) {
  const kk = normalizeString(k);
  if (!kk) return "planned"; // default + abwärtskompatibel
  if (!isValidKind(kk)) throw new Error("Ungültiger kind-Wert.");
  return kk;
}

function isValidDateYYYYMMDD(date) {
  const s = normalizeString(date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s);
  return !isNaN(d.getTime());
}

function effectiveKind(docData) {
  // alte docs ohne kind => planned
  return normalizeString(docData?.kind) || "planned";
}

function sortByDateDesc(items) {
  items.sort((a, b) => normalizeString(b.date).localeCompare(normalizeString(a.date)));
  return items;
}

// ======================================================
// ✅ GEPLANTE GESCHENKE (default)
// ======================================================

/**
 * createGift = "geplantes" Geschenk (default)
 * (z.B. aus Geschenkideen-Konvertierung)
 */
export async function createGift({
  personId,
  personName,
  occasionId = "",
  occasionName = "",
  date,
  note = "",
  status = "offen",
  sourceIdeaId = null,
  kind = "planned" // default
}) {
  const pid = requireNonEmpty("personId", personId);
  const pname = requireNonEmpty("personName", personName);

  if (!isValidDateYYYYMMDD(date)) throw new Error("Ungültiges Datum (YYYY-MM-DD).");
  if (!isValidStatus(status)) throw new Error("Ungültiger Status.");

  const k = normalizeKind(kind);
  const ref = await giftsColRef();

  const docRef = await addDoc(ref, {
    personId: pid,
    personName: pname,
    occasionId: normalizeString(occasionId),
    occasionName: normalizeString(occasionName),
    date: normalizeString(date),
    note: normalizeString(note),
    status,
    kind: k,
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

/**
 * listGifts = geplante Geschenke (kind != "past")
 * Abwärtskompatibel: Dokumente ohne kind gelten als planned.
 */
export async function listGifts() {
  const ref = await giftsColRef();
  const q = query(ref, orderBy("date", "desc"));
  const snap = await getDocs(q);

  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const planned = all.filter((x) => effectiveKind(x) !== "past");
  return planned;
}

export async function listGiftsByPerson(personId) {
  const pid = requireNonEmpty("personId", personId);
  const ref = await giftsColRef();
  const q = query(ref, where("personId", "==", pid));
  const snap = await getDocs(q);

  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const planned = all.filter((x) => effectiveKind(x) !== "past");
  return sortByDateDesc(planned);
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

  if (patch.kind !== undefined) out.kind = normalizeKind(patch.kind);

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
 * Helper für TF-06:
 * Existieren IRGENDWELCHE Geschenke (planned oder past) für Person?
 */
export async function hasGiftsByPerson(personId) {
  const pid = requireNonEmpty("personId", personId);
  const ref = await giftsColRef();
  const q = query(ref, where("personId", "==", pid), limit(1));
  const snap = await getDocs(q);
  return !snap.empty;
}

// ======================================================
// ✅ VERGANGENE GESCHENKE (TF-09 bis TF-13)
// ======================================================

/**
 * TF-09: Vergangenes Geschenk anlegen
 */
export async function createPastGift({
  personId,
  personName,
  occasionId = "",
  occasionName = "",
  date,
  note = "",
  status = "ueberreicht"
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
    kind: "past",
    sourceIdeaId: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  return docRef.id;
}

/**
 * TF-13: Gesamtübersicht vergangene Geschenke
 */
export async function listPastGifts() {
  const ref = await giftsColRef();
  const q = query(ref, orderBy("date", "desc"));
  const snap = await getDocs(q);

  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const past = all.filter((x) => effectiveKind(x) === "past");
  return sortByDateDesc(past);
}

/**
 * TF-10: Historie pro Person anzeigen
 */
export async function listPastGiftsByPerson(personId) {
  const pid = requireNonEmpty("personId", personId);
  const ref = await giftsColRef();
  const q = query(ref, where("personId", "==", pid));
  const snap = await getDocs(q);

  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const past = all.filter((x) => effectiveKind(x) === "past");
  return sortByDateDesc(past);
}

/**
 * TF-11: Vergangenes Geschenk bearbeiten (Datum/Notiz/Anlass)
 */
export async function updatePastGift(id, patch = {}) {
  if (!id) throw new Error("ID fehlt.");

  const current = await getGift(id);
  if (!current) throw new Error("Geschenk nicht gefunden.");
  if (effectiveKind(current) !== "past") {
    throw new Error("updatePastGift: Dieses Geschenk ist kein vergangenes Geschenk (kind!='past').");
  }

  const allowed = {};
  if (patch.occasionId !== undefined) allowed.occasionId = normalizeString(patch.occasionId);
  if (patch.occasionName !== undefined) allowed.occasionName = normalizeString(patch.occasionName);

  if (patch.date !== undefined) {
    if (!isValidDateYYYYMMDD(patch.date)) throw new Error("Ungültiges Datum (YYYY-MM-DD).");
    allowed.date = normalizeString(patch.date);
  }

  if (patch.note !== undefined) allowed.note = normalizeString(patch.note);

  if (patch.status !== undefined) {
    if (!isValidStatus(patch.status)) throw new Error("Ungültiger Status.");
    allowed.status = patch.status;
  }

  await updateGift(id, { ...allowed, kind: "past" });
}

/**
 * TF-12: Vergangenes Geschenk löschen
 */
export async function deletePastGift(id) {
  const current = await getGift(id);
  if (!current) return;
  if (effectiveKind(current) !== "past") {
    throw new Error("deletePastGift: Dieses Geschenk ist kein vergangenes Geschenk (kind!='past').");
  }
  await deleteGift(id);
}
/**
 * Helper für TF-19: Existieren Geschenke (planned oder past) für Anlass?
 */
export async function hasGiftsByOccasion(occasionId) {
  const oid = requireNonEmpty("occasionId", occasionId);
  const ref = await giftsColRef();
  const q = query(ref, where("occasionId", "==", oid), limit(1));
  const snap = await getDocs(q);
  return !snap.empty;
}
