/**
 * suggestion-service.js
 * -------------------------------------------------------
 * TF-50: Automatische Generierung neuer Geschenkideen
 *
 * -> Generiert Vorschläge "on the fly" (nicht speichern)
 * -> TF-51 übernimmt Vorschlag in echte giftIdeas Collection
 */

function normalize(s) {
  return String(s || "")
    .trim()
    .toLowerCase();
}

function sanitizeSourceText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function collectSourceNames({ pastGifts = [], existingGifts = [], existingIdeas = [] }) {
  const freq = new Map();

  const addName = (raw) => {
    const name = sanitizeSourceText(raw);
    if (!name) return;

    const key = normalize(name);
    const existing = freq.get(key);
    if (existing) {
      existing.count += 1;
      return;
    }

    freq.set(key, { name, count: 1 });
  };

  for (const g of pastGifts || []) {
    addName(g?.giftName || g?.content || "");
  }

  for (const g of existingGifts || []) {
    addName(g?.giftName || g?.content || "");
  }

  for (const idea of existingIdeas || []) {
    addName(idea?.giftName || idea?.content || "");
  }

  return [...freq.values()].sort((a, b) => b.count - a.count);
}

function existingIdeaContains(existingIdeas, keyword) {
  const k = normalize(keyword);
  if (!k) return false;
  return (existingIdeas || []).some((i) => {
    const text = normalize(i?.giftName || i?.content || "");
    return text.includes(k);
  });
}

function buildSuggestion({ content, personId, personName, reason }) {
  return {
    title: content,
    content,
    type: "text",
    status: "offen",
    occasionId: "",
    occasionName: "",
    personId,
    personName,
    reason,
  };
}

function pushIfNew({ suggestions, existingIdeas, content, personId, personName, reason }) {
  if (!content) return;

  const normalizedContent = normalize(content);
  const alreadyGenerated = suggestions.some(
    (s) => normalize(s?.content || s?.title || "") === normalizedContent,
  );
  if (alreadyGenerated) return;

  if (existingIdeaContains(existingIdeas, normalizedContent)) return;

  suggestions.push(
    buildSuggestion({ content, personId, personName, reason }),
  );
}

function buildSuggestionsFromSources({ personId, personName, existingIdeas, sourceNames }) {
  const suggestions = [];

  for (const { name, count } of sourceNames) {
    const reason = `Automatisch generiert: basiert auf vorhandenen Daten zu "${name}" (${count}x).`;

    pushIfNew({
      suggestions,
      existingIdeas,
      content: `Zubehör zu ${name}`,
      personId,
      personName,
      reason,
    });

    pushIfNew({
      suggestions,
      existingIdeas,
      content: `Upgrade von ${name}`,
      personId,
      personName,
      reason,
    });

    if (suggestions.length >= 12) break;
  }

  return suggestions.slice(0, 12);
}

/**
 * Helper: erzeugt mehrere Vorschäge aus einer "Kategorie + Liste".
 */
function makeListSuggestions({ items, personId, personName, reason }) {
  return (items || [])
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .map((item) =>
      buildSuggestion({
        content: item,
        personId,
        personName,
        reason,
      }),
    );
}

/**
 * generateIdeasForPerson({ personId, personName, pastGifts, existingGifts, existingIdeas })
 */
export function generateIdeasForPerson({
  personId,
  personName,
  pastGifts,
  existingGifts,
  existingIdeas,
}) {
  const sourceNames = collectSourceNames({
    pastGifts,
    existingGifts,
    existingIdeas,
  });

  const fromSourceData = buildSuggestionsFromSources({
    personId,
    personName,
    existingIdeas,
    sourceNames,
  });

  if (fromSourceData.length > 0) return fromSourceData;

  const fallbackReason =
    "Es gibt noch keine Daten zu bestehenden oder vergangenen Geschenken bzw. Ideen für diese Person. Deshalb werden allgemeine Ideen vorgeschlagen.";

  const fallbackBlocks = [
    ["Lieblingsladen Gutschein", "Restaurant Gutschein", "Drogerie Gutschein"],
    ["Essen gehen", "Kinoabend", "Kurztrip"],
    ["Fotobuch", "Gravur Geschenk", "Erinnerungsbox"],
  ];

  const fallbackSuggestions = [];
  for (const block of fallbackBlocks) {
    for (const sug of makeListSuggestions({
      items: block,
      personId,
      personName,
      reason: fallbackReason,
    })) {
      if (existingIdeaContains(existingIdeas, sug.content)) continue;
      fallbackSuggestions.push(sug);
      if (fallbackSuggestions.length >= 12) break;
    }
    if (fallbackSuggestions.length >= 12) break;
  }

  return fallbackSuggestions.slice(0, 12);
}
