/**
 * Country and city configuration.
 *
 * Everything that differs between markets (currency, area unit, how rooms are
 * counted, supported cities) lives here, so the rest of the app never branches
 * on a country code directly.
 */

export const COUNTRY_CODES = ["FR", "GB"] as const;
export type CountryCode = (typeof COUNTRY_CODES)[number];

export type CurrencyCode = "EUR" | "GBP";
export type AreaUnit = "m2" | "sqft";

/**
 * How listings in a market describe their size.
 * - "rooms": French "pièces" (living room + bedrooms, kitchen/bathroom excluded).
 * - "bedrooms": UK convention, number of bedrooms only (0 = studio).
 */
export type RoomConvention = "rooms" | "bedrooms";

export interface LatLng {
  lat: number;
  lng: number;
}

/** [west, south, east, north] in WGS84 degrees. */
export type BoundingBox = [number, number, number, number];

export interface CityConfig {
  id: string;
  name: string;
  country: CountryCode;
  center: LatLng;
  bbox: BoundingBox;
  timeZone: string;
}

export interface CountryConfig {
  code: CountryCode;
  name: string;
  locale: string;
  currency: CurrencyCode;
  areaUnit: AreaUnit;
  roomConvention: RoomConvention;
}

export const COUNTRIES: Record<CountryCode, CountryConfig> = {
  FR: {
    code: "FR",
    name: "France",
    locale: "fr-FR",
    currency: "EUR",
    areaUnit: "m2",
    roomConvention: "rooms",
  },
  GB: {
    code: "GB",
    name: "Royaume-Uni",
    locale: "en-GB",
    currency: "GBP",
    areaUnit: "sqft",
    roomConvention: "bedrooms",
  },
};

export const CITIES = [
  {
    id: "paris",
    name: "Paris",
    country: "FR",
    center: { lat: 48.8566, lng: 2.3522 },
    bbox: [2.224, 48.815, 2.47, 48.902],
    timeZone: "Europe/Paris",
  },
  {
    id: "rennes",
    name: "Rennes",
    country: "FR",
    center: { lat: 48.1173, lng: -1.6778 },
    bbox: [-1.753, 48.077, -1.624, 48.155],
    timeZone: "Europe/Paris",
  },
  {
    id: "london",
    name: "Londres",
    country: "GB",
    center: { lat: 51.5072, lng: -0.1276 },
    bbox: [-0.51, 51.286, 0.334, 51.692],
    timeZone: "Europe/London",
  },
] as const satisfies readonly CityConfig[];

export type CityId = (typeof CITIES)[number]["id"];

export function isCountryCode(value: string): value is CountryCode {
  return (COUNTRY_CODES as readonly string[]).includes(value);
}

export function getCountry(code: CountryCode): CountryConfig {
  return COUNTRIES[code];
}

export function getCity(id: string): CityConfig | undefined {
  return CITIES.find((city) => city.id === id);
}

export function citiesOf(country: CountryCode): CityConfig[] {
  return CITIES.filter((city) => city.country === country);
}

export function isCityId(value: string): value is CityId {
  return CITIES.some((city) => city.id === value);
}
