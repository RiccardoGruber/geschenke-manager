/**
 * gift-service.js
 * -------------------------------------------------------
 * CRUD service for gifts.
 * Stores data under:
 * users/{uid}/gifts/{giftId}
 *
 * Extension: "past gifts" via the `kind` field
 * - kind: "planned" (default)  -> planned gifts / from gift ideas
 * - kind: "past"               -> past gifts (history)
 *
 * Backward compatible:
 * - legacy documents without `kind` are treated as "planned".
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
  limit,
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

function isDateInPast(date) {
  const s = normalizeString(date);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;

  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return d < today;
}

function effectiveKind(docData) {
  // legacy docs without kind => planned
  return normalizeString(docData?.kind) || "planned";
}

function sortByDateDesc(items) {
  items.sort((a, b) =>
    normalizeString(b.date).localeCompare(normalizeString(a.date)),
  );
  return items;
}

// ======================================================
// ✅ PLANNED GIFTS (default)
// ======================================================

/**
 * createGift = "planned" gift (default)
 * (e.g. from gift idea conversion)
 */
export async function createGift({
  personId,
  personName,
  occasionId = "",
  occasionName = "",
  giftName = "",
  date,
  note = "",
  status = "offen",
  sourceIdeaId = null,
  kind = "planned", // default
}) {
  const pid = requireNonEmpty("personId", personId);
  const pname = requireNonEmpty("personName", personName);

  if (!isValidDateYYYYMMDD(date))
    throw new Error("Ungültiges Datum (YYYY-MM-DD).");
  if (!isValidStatus(status)) throw new Error("Ungültiger Status.");

  const k = normalizeKind(kind);
  const ref = await giftsColRef();

  const docRef = await addDoc(ref, {
    personId: pid,
    personName: pname,
    occasionId: normalizeString(occasionId),
    occasionName: normalizeString(occasionName),
    giftName: normalizeString(giftName),
    date: normalizeString(date),
    note: normalizeString(note),
    status,
    kind: k,
    sourceIdeaId: sourceIdeaId ? String(sourceIdeaId) : null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
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
 * listGifts = planned gifts (kind != "past")
* Backward compatible: documents without kind are treated as planned.
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

  if (patch.personId !== undefined)
    out.personId = requireNonEmpty("personId", patch.personId);
  if (patch.personName !== undefined)
    out.personName = requireNonEmpty("personName", patch.personName);
  if (patch.occasionId !== undefined)
    out.occasionId = normalizeString(patch.occasionId);
  if (patch.occasionName !== undefined)
    out.occasionName = normalizeString(patch.occasionName);
  if (patch.giftName !== undefined)
    out.giftName = normalizeString(patch.giftName);

  if (patch.date !== undefined) {
    if (!isValidDateYYYYMMDD(patch.date))
      throw new Error("Ungültiges Datum (YYYY-MM-DD).");
    out.date = normalizeString(patch.date);
  }
  if (patch.note !== undefined) out.note = normalizeString(patch.note);

  if (patch.status !== undefined) {
    if (!isValidStatus(patch.status)) throw new Error("Ungültiger Status.");
    out.status = patch.status;
  }

  if (patch.sourceIdeaId !== undefined)
    out.sourceIdeaId = patch.sourceIdeaId ? String(patch.sourceIdeaId) : null;

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
 * Helper for TF-06:
 * Do ANY gifts (planned or past) exist for a person?
 */
export async function hasGiftsByPerson(personId) {
  const pid = requireNonEmpty("personId", personId);
  const ref = await giftsColRef();
  const q = query(ref, where("personId", "==", pid), limit(1));
  const snap = await getDocs(q);
  return !snap.empty;
}

// ======================================================
// ✅ PAST GIFTS (TF-09 to TF-13)
// ======================================================

/**
 * TF-09: Create a past gift
 */
export async function createPastGift({
  personId,
  personName,
  occasionId = "",
  occasionName = "",
  date,
  note = "",
  status = "ueberreicht",
}) {
  const pid = requireNonEmpty("personId", personId);
  const pname = requireNonEmpty("personName", personName);

  if (!isValidDateYYYYMMDD(date))
    throw new Error("Ungültiges Datum (YYYY-MM-DD).");
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
    updatedAt: serverTimestamp(),
  });

  return docRef.id;
}

/**
 * TF-13: Overall overview of past gifts
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
 * TF-10: Show history per person
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
 * TF-11: Edit a past gift (date/note/occasion)
 */
export async function updatePastGift(id, patch = {}) {
  if (!id) throw new Error("ID fehlt.");

  const current = await getGift(id);
  if (!current) throw new Error("Geschenk nicht gefunden.");
  if (effectiveKind(current) !== "past") {
    throw new Error(
      "updatePastGift: Dieses Geschenk ist kein vergangenes Geschenk (kind!='past').",
    );
  }

  const allowed = {};
  if (patch.occasionId !== undefined)
    allowed.occasionId = normalizeString(patch.occasionId);
  if (patch.occasionName !== undefined)
    allowed.occasionName = normalizeString(patch.occasionName);

  if (patch.date !== undefined) {
    if (!isValidDateYYYYMMDD(patch.date))
      throw new Error("Ungültiges Datum (YYYY-MM-DD).");
    allowed.date = normalizeString(patch.date);
  }

  if (patch.note !== undefined) allowed.note = normalizeString(patch.note);

  if (patch.status !== undefined) {
    if (!isValidStatus(patch.status)) throw new Error("Ungültiger Status.");
    allowed.status = patch.status;
  }

  const nextKind =
    allowed.date !== undefined && !isDateInPast(allowed.date)
      ? "planned"
      : "past";

  await updateGift(id, { ...allowed, kind: nextKind });
}

/**
 * TF-12: Delete a past gift
 */
export async function deletePastGift(id) {
  const current = await getGift(id);
  if (!current) return;
  if (effectiveKind(current) !== "past") {
    throw new Error(
      "deletePastGift: Dieses Geschenk ist kein vergangenes Geschenk (kind!='past').",
    );
  }
  await deleteGift(id);
}
/**
 * Helper for TF-19: Do gifts (planned or past) exist for an occasion?
 */
export async function hasGiftsByOccasion(occasionId) {
  const oid = requireNonEmpty("occasionId", occasionId);
  const ref = await giftsColRef();
  const q = query(ref, where("occasionId", "==", oid), limit(1));
  const snap = await getDocs(q);
  return !snap.empty;
}

