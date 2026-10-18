import type { CityConfig } from "@/domain/countries";

function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/**
 * Appends the city to an address that doesn't already end with it, so
 * "1 Downing Street" is looked up as "1 Downing Street, London" and can't
 * land in a namesake street of another town.
 */
export function withCityName(query: string, city: Pick<CityConfig, "name" | "localName">): string {
  const address = query.trim().replace(/[\s,.;]+$/, "");
  const folded = fold(address);
  const endsWithCity = [city.localName, city.name].some((name) => {
    const suffix = fold(name);
    return folded === suffix || (folded.endsWith(suffix) && /[^\p{L}\p{N}]/u.test(folded.at(-suffix.length - 1)!));
  });
  return endsWithCity ? address : `${address}, ${city.localName}`;
}
