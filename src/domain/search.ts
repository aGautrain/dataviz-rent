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
