/**
 * gift-convert.js
 * -------------------------------------------------------
 * Umwandlung Geschenkidee -> Geschenk
 */

import { getGiftIdea, updateGiftIdea } from "./gift-idea-service.js";
import { createGift } from "./gift-service.js";

function todayYYYYMMDD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Konvertiert eine Idee in ein Geschenk.
 * - legt Gift an (date = heute)
 * - markiert Idee als "erledigt"
 * Rückgabe: { giftId }
 */
export async function convertIdeaToGift(ideaId, { date = todayYYYYMMDD(), note = "" } = {}) {
  const idea = await getGiftIdea(ideaId);
  if (!idea) throw new Error("Geschenkidee nicht gefunden.");

  const giftId = await createGift({
    personId: idea.personId,
    personName: idea.personName,
    occasionId: idea.occasionId || "",
    occasionName: idea.occasionName || "",
    date,
    note: note || (idea.type === "text" ? idea.content : ""),
    status: "offen",
    sourceIdeaId: ideaId
  });

  await updateGiftIdea(ideaId, { status: "erledigt" });

  return { giftId };
}
