// AI-written phrases can carry notes meant for the reviewer: "(unspecified)",
// "(pizza emoji in caption; specific items not stated)", "room 102 per flyer;
// caption says CNH 112". The worker cleans them before saving
// (worker/clean.py, same rules); this runs again before display, for rows
// saved earlier or typed in by hand.

// Words that mark a bracketed or trailing bit as a note about the post, not part of the place.
const NOTE_WORDS = /\b(caption|flyer|poster|post|stated|unspecified|implied|presumably|inferred|unclear|note|updated|per)\b/i;
const EDGE_PUNCTUATION = /^[\s,.;:–—-]+|[\s,.;:–—-]+$/g;

/** "Free free pizza" -> "Free pizza". */
function dropRepeatedWords(text: string): string {
  return text.replace(/\b(\w+)(\s+\1\b)+/gi, "$1");
}

function tidy(text: string): string | null {
  const s = dropRepeatedWords(text).replace(/\s{2,}/g, " ").replace(EDGE_PUNCTUATION, "");
  return s || null;
}

/** The food phrase a student reads on a card: no brackets, no notes. */
export function cleanFood(text: string | null): string | null {
  if (!text) return null;
  const s = text
    .replace(/\s*[([][^)\]]*[)\]]/g, "") // every bracketed aside
    .split(/\s*;\s*/)[0] // anything after a semicolon is a note
    .replace(/,?\s*(specific )?(items|details|food) (are )?not (stated|specified)\b.*$/i, "")
    .replace(/\bunspecified\b/gi, "");
  return tidy(s);
}

/**
 * The place as a student would look for it. Keeps a building's name in
 * brackets ("JHE 326H (John Hodgins Engineering Building)") but drops
 * bracketed notes and anything after a semicolon.
 */
export function cleanPlace(text: string | null): string | null {
  if (!text) return null;
  const s = text
    .replace(/\s*\(([^)]*)\)/g, (aside, inner: string) => (NOTE_WORDS.test(inner) ? "" : aside))
    .split(/\s*;\s*/)[0]
    .replace(/\s+(per|according to)\s+(the\s+)?(flyer|caption|post|poster)\b/gi, "");
  return tidy(s);
}

/** "Free pizza" for "pizza", but "Free food" stays as it is: never "Free free". */
export function freeFoodPhrase(description: string | null): string {
  const food = cleanFood(description);
  if (!food) return "Free food";
  const phrase = /^free\b/i.test(food) ? food : `free ${food}`;
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}
