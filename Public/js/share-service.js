/**
 * share-service.js
 * -------------------------------------------------------
 * Teilen per Link (TF-46 bis TF-48)
 *
 * Collection:
 *   shareLinks/{token}
 *
 * ShareLink-Dokument enthält "public snapshot" der Inhalte, damit Empfänger
 * ohne Login lesen kann (ohne eure privaten user/* Collections freizugeben).
 *
 * Kinds:
 * - "giftIdeasByPerson"  -> Snapshot: alle Ideen einer Person
 * - "giftIdea"           -> Snapshot: eine einzelne Idee
 */

import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { auth, db } from "./firebase-config.js";

import { getGiftIdea, listGiftIdeas } from "./gift-idea-service.js";

// ---------- Auth helpers ----------
function waitForAuthReadyOnce() {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      resolve(user);
    });
  });
}

async function getUidOrThrow() {
  const user = auth.currentUser ?? (await waitForAuthReadyOnce());
  if (!user) throw new Error("Kein eingeloggter Benutzer.");
  return user.uid;
}

// ---------- helpers ----------
function normalizeString(v) {
  return String(v ?? "").trim();
}

function requireNonEmpty(label, v) {
  const s = normalizeString(v);
  if (!s) throw new Error(`${label} ist Pflicht.`);
  return s;
}

function generateToken(len = 28) {
  // Browser crypto
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function buildShareUrl(token) {
  const base = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, "/");
  return `${base}share.html?t=${encodeURIComponent(token)}`;
}

function ttlToExpiresAt(ttlDays) {
  const days = Math.max(1, Number(ttlDays) || 30);
  return Date.now() + days * 24 * 60 * 60 * 1000;
}

function toPublicIdeaSnapshot(idea) {
  return {
    id: idea.id,
    type: normalizeString(idea.type),
    content: normalizeString(idea.content),
    status: normalizeString(idea.status),
    occasionName: normalizeString(idea.occasionName),
    personId: normalizeString(idea.personId),
    personName: normalizeString(idea.personName)
  };
}

// ---------- API ----------
/**
 * TF-46: Teilen-Link erstellen für ALLE Geschenkideen einer Person
 * Snapshot wird in shareLinks gespeichert.
 */
export async function createShareLinkGiftIdeasByPerson({ personId, personName = "", ttlDays = 30 } = {}) {
  const uid = await getUidOrThrow();
  const pid = requireNonEmpty("personId", personId);

  const token = generateToken();
  const expiresAt = ttlToExpiresAt(ttlDays);

  const all = await listGiftIdeas();
  const items = all
    .filter((i) => normalizeString(i.personId) === pid)
    .map((i) => toPublicIdeaSnapshot(i));

  await setDoc(doc(db, "shareLinks", token), {
    uid,
    kind: "giftIdeasByPerson",
    personId: pid,
    personName: normalizeString(personName),
    items,
    expiresAt,
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  return buildShareUrl(token);
}

/**
 * TF-46: Teilen-Link erstellen für EINE Geschenkidee
 */
export async function createShareLinkGiftIdea({ ideaId, ttlDays = 30 } = {}) {
  const uid = await getUidOrThrow();
  const iid = requireNonEmpty("ideaId", ideaId);

  const idea = await getGiftIdea(iid);
  if (!idea) throw new Error("Geschenkidee nicht gefunden.");

  const token = generateToken();
  const expiresAt = ttlToExpiresAt(ttlDays);

  await setDoc(doc(db, "shareLinks", token), {
    uid,
    kind: "giftIdea",
    ideaId: iid,
    personId: normalizeString(idea.personId),
    personName: normalizeString(idea.personName),
    item: toPublicIdeaSnapshot(idea),
    expiresAt,
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  return buildShareUrl(token);
}

/**
 * TF-47/48: ShareToken auflösen (PUBLIC READ)
 */
export async function resolveShareToken(token) {
  const t = requireNonEmpty("token", token);
  const snap = await getDoc(doc(db, "shareLinks", t));

  if (!snap.exists()) {
    const err = new Error("Link ungültig oder nicht gefunden.");
    err.code = "SHARE_NOT_FOUND";
    throw err;
  }

  const data = snap.data() || {};

  if (data.isActive === false) {
    const err = new Error("Link ist deaktiviert.");
    err.code = "SHARE_INACTIVE";
    throw err;
  }

  const expiresAt = Number(data.expiresAt || 0);
  if (!expiresAt || Date.now() > expiresAt) {
    const err = new Error("Link ist abgelaufen.");
    err.code = "SHARE_EXPIRED";
    throw err;
  }

  if (!data.kind) {
    const err = new Error("Link ist ungültig.");
    err.code = "SHARE_INVALID";
    throw err;
  }

  return { token: t, ...data };
}

/**
 * Optional: Link deaktivieren (Owner only; nützlich aber nicht zwingend für TF-46..48)
 */
export async function deactivateShareLink(token) {
  const uid = await getUidOrThrow();
  const t = requireNonEmpty("token", token);

  // simple owner check via stored uid
  const current = await resolveShareToken(t);
  if (current.uid !== uid) throw new Error("Keine Berechtigung, diesen Link zu deaktivieren.");

  await updateDoc(doc(db, "shareLinks", t), {
    isActive: false,
    updatedAt: serverTimestamp()
  });
}