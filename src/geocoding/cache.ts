import type { CityConfig } from "@/domain/countries";
import type { Place } from "./types";

/** Lasting storage for geocoder answers (the database); null = not found. */
export interface GeocodeStore {
  /** undefined when this address was never asked. */
  get(cityId: string, query: string): Promise<Place | null | undefined>;
  put(cityId: string, query: string, place: Place | null): Promise<void>;
}

export function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Asks the geocoders once per address and city: recent answers stay in
 * memory, and with a store every answer is kept for good, which spares the
 * public services (Nominatim's policy asks for it).
 */
export function withGeocodeCache(
  geocode: (query: string, city: CityConfig) => Promise<Place | null>,
  { memorySize = 500, store }: { memorySize?: number; store?: GeocodeStore } = {},
): (query: string, city: CityConfig) => Promise<Place | null> {
  const recent = new Map<string, Place | null>();
  const remember = (key: string, place: Place | null) => {
    if (recent.size >= memorySize) recent.delete(recent.keys().next().value!);
    recent.set(key, place);
    return place;
  };

  return async (query, city) => {
    const normalized = normalizeQuery(query);
    const key = `${city.id}|${normalized}`;
    if (recent.has(key)) return recent.get(key)!;
    const stored = await store?.get(city.id, normalized);
    if (stored !== undefined) return remember(key, stored);
    const place = await geocode(query.trim(), city);
    await store?.put(city.id, normalized, place);
    return remember(key, place);
  };
}
