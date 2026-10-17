import type { CityConfig, CountryCode } from "@/domain/countries";
import { createBanGeocoder } from "./ban";
import { createNominatimGeocoder } from "./nominatim";
import type { Geocoder, Place } from "./types";

const GEOCODERS: Record<CountryCode, Geocoder> = {
  FR: createBanGeocoder(),
  GB: createNominatimGeocoder(),
};

const CACHE_SIZE = 500;
const cache = new Map<string, Place | null>();

/** Geocodes with the city's national geocoder, remembering recent answers. */
export async function geocode(query: string, city: CityConfig): Promise<Place | null> {
  const key = `${city.id}|${query.trim().toLowerCase()}`;
  if (cache.has(key)) return cache.get(key)!;
  const place = await GEOCODERS[city.country].geocode(query.trim(), city);
  if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value!);
  cache.set(key, place);
  return place;
}

export type { Place } from "./types";
