import { createGeocodeStore } from "@/db/caches";
import { getDb } from "@/db/client";
import type { CityConfig, CountryCode } from "@/domain/countries";
import { createBanGeocoder } from "./ban";
import { withGeocodeCache } from "./cache";
import { createNominatimGeocoder } from "./nominatim";
import { withCityName } from "./query";
import type { Geocoder, Place } from "./types";

const GEOCODERS: Record<CountryCode, Geocoder> = {
  FR: createBanGeocoder(),
  GB: createNominatimGeocoder(),
};

let cached: ((query: string, city: CityConfig) => Promise<Place | null>) | undefined;

/**
 * Geocodes with the city's national geocoder, asking it once per address.
 * The city is appended when the address doesn't end with it.
 */
export function geocode(query: string, city: CityConfig): Promise<Place | null> {
  cached ??= withGeocodeCache((text, near) => GEOCODERS[near.country].geocode(text, near), {
    store: createGeocodeStore(getDb()),
  });
  return cached(withCityName(query, city), city);
}

export type { Place } from "./types";
