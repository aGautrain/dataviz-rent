// Word edges that also work around accented letters.
const START = String.raw`(?<![\p{L}\p{N}-])`;
const END = String.raw`(?![\p{L}\p{N}])`;

const PART = new RegExp(`${START}part[\\s-]*furnished${END}`, "u");
const UNFURNISHED = new RegExp(
  `${START}(?:unfurnished|non[\\s-]*meublée?s?|(?:location|loué|louée)\\s+vide)${END}`,
  "u",
);
// "meublé" keeps its accent: "meuble" alone is a piece of furniture.
const FURNISHED = new RegExp(`${START}(?:furnished|meublée?s?)${END}`, "u");

/**
 * Reads "furnished" or "unfurnished" (meublé / non meublé) from a listing's
 * text, for sites whose search results carry no furnished field. Returns null
 * when the text says neither, or both ("furnished or unfurnished").
 */
export function furnishedFromText(...texts: (string | null | undefined)[]): boolean | null {
  const text = texts.filter(Boolean).join(" ").normalize("NFC").toLowerCase();
  if (PART.test(text)) return null;
  const unfurnished = UNFURNISHED.test(text);
  const furnished = FURNISHED.test(text.replace(new RegExp(UNFURNISHED.source, "gu"), ""));
  if (unfurnished === furnished) return null;
  return furnished;
}
