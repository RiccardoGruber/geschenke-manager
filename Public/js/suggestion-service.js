/**
 * suggestion-service.js
 * -------------------------------------------------------
 * TF-50: Automatische Generierung neuer Geschenkideen
 *
 * -> Generiert Vorschläge "on the fly" (nicht speichern)
 * -> TF-51 übernimmt Vorschlag in echte giftIdeas Collection
 */

function normalize(s) {
  return String(s || "").trim().toLowerCase();
}

function tokenize(text) {
  const t = normalize(text);
  if (!t) return [];
  return t
    .replace(/[^a-zäöüß0-9\s-]/gi, " ")
    .split(/\s+/)
    .map(x => x.trim())
    .filter(x => x.length >= 3);
}

function topKeywordsFromPast(pastGifts, max = 6) {
  const freq = new Map();

  for (const g of pastGifts || []) {
    const note = g.note || "";
    tokenize(note).forEach(w => {
      freq.set(w, (freq.get(w) || 0) + 1);
    });
  }

  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
  return sorted.slice(0, max).map(([word, count]) => ({ word, count }));
}

function existingIdeaContains(existingIdeas, keyword) {
  const k = normalize(keyword);
  return (existingIdeas || []).some(i => normalize(i.content).includes(k));
}

/**
 * Helper: erzeugt mehrere Vorschläge aus einer "Kategorie + Liste".
 * Beispiel:
 *  category="Erlebnis"
 *  items=["Essen gehen","Kino","Kurztrip","Massage"]
 * -> liefert 4 einzelne Suggestions
 */
function makeListSuggestions({ category, items, personId, personName, reason }) {
  return (items || [])
    .map(x => String(x || "").trim())
    .filter(Boolean)
    .map(item => ({
      title: item,        
      content: item,      // wird übernommen als GiftIdea.content
      type: "text",
      status: "offen",
      occasionId: "",
      occasionName: "",
      personId,
      personName,
      reason: reason || `Fallback: Kategorie "${category}".`
    }));
}

/**
 * generateIdeasForPerson({ personId, personName, pastGifts, existingIdeas })
 */
export function generateIdeasForPerson({ personId, personName, pastGifts, existingIdeas }) {
  const suggestions = [];

  // 1) Keywords aus vergangenen Geschenken (aus Notiz-Feld)
  const top = topKeywordsFromPast(pastGifts, 8);

  for (const { word, count } of top) {
    if (existingIdeaContains(existingIdeas, word)) continue;

    suggestions.push({
      title: word,
      content: `${word}`,
      type: "text",
      status: "offen",
      occasionId: "",
      occasionName: "",
      personId,
      personName,
      reason: `Automatisch generiert: "${word}" kam in vergangenen Geschenken ${count}× vor.`
    });
  }

  // 2) Fallback: wenn (noch) zu wenig Daten vorhanden sind
  if (suggestions.length === 0) {
    const fallbackBlocks = [
      {
        category: "Gutschein",
        items: ["Lieblingsladen", "Amazon", "Drogerie", "Restaurant"],
        reason: "Fallback: Zu wenig vergangene Daten – Gutschein-Ideen als Start."
      },
      {
        category: "Erlebnis",
        items: ["Essen gehen", "Kino", "Kurztrip", "Massage"],
        reason: "Fallback: Zu wenig vergangene Daten – Erlebnis-Ideen als Start."
      },
      {
        category: "Personalisiert",
        items: ["Fotobuch", "Gravur", "Custom Tasse", "Erinnerungsbox"],
        reason: "Fallback: Zu wenig vergangene Daten – personalisierte Ideen als Start."
      }
    ];

    for (const block of fallbackBlocks) {
      for (const sug of makeListSuggestions({
        category: block.category,
        items: block.items,
        personId,
        personName,
        reason: block.reason
      })) {
        if (existingIdeaContains(existingIdeas, sug.content)) continue;
        suggestions.push(sug);
      }
    }
  }

  // 3) Max 12 Vorschläge
  return suggestions.slice(0, 12);
}