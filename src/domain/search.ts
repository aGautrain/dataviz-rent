import type { CityId } from "./countries";

/**
 * What a user is looking for, in the market's own terms: rents are monthly and
 * in the city's currency (major units), areas in square meters.
 *
 * Travel time is not part of it: no listing site filters on it, so the app
 * applies it after collection.
 */
export interface SearchCriteria {
  cityId: CityId;
  minRent?: number;
  maxRent?: number;
  minBedrooms?: number;
  maxBedrooms?: number;
  minAreaM2?: number;
  maxAreaM2?: number;
  furnished?: boolean;
}

type QueryValue = string | string[] | undefined;
type Query = Record<string, QueryValue>;

function first(value: QueryValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function positiveNumber(value: QueryValue): number | undefined {
  const raw = first(value)?.trim();
  if (!raw) return undefined;
  const parsed = Number(raw.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

/**
 * Reads criteria from URL query parameters (the search form submits by GET, so
 * every search is a shareable link). Unknown or invalid values are ignored.
 */
export function parseCriteria(query: Query, isCity: (id: string) => id is CityId): SearchCriteria {
  const city = first(query.city);
  const furnished = first(query.furnished);
  return {
    cityId: city && isCity(city) ? city : "paris",
    minRent: positiveNumber(query.minRent),
    maxRent: positiveNumber(query.maxRent),
    minBedrooms: positiveNumber(query.minBedrooms),
    maxBedrooms: positiveNumber(query.maxBedrooms),
    minAreaM2: positiveNumber(query.minArea),
    maxAreaM2: positiveNumber(query.maxArea),
    furnished: furnished === "yes" ? true : furnished === "no" ? false : undefined,
  };
}
