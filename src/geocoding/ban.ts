import type { Geocoder } from "./types";

interface BanResponse {
  features: {
    geometry: { coordinates: [number, number] };
    properties: { label: string; score: number };
  }[];
}

const MIN_SCORE = 0.4;

/**
 * Base Adresse Nationale (France), served by IGN's Géoplateforme. Free, no
 * key, results biased towards the city being searched.
 */
export function createBanGeocoder(fetchImpl: typeof fetch = fetch): Geocoder {
  return {
    async geocode(query, near) {
      const url = new URL("https://data.geopf.fr/geocodage/search");
      url.searchParams.set("q", query);
      url.searchParams.set("limit", "1");
      url.searchParams.set("lat", String(near.center.lat));
      url.searchParams.set("lon", String(near.center.lng));
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error(`BAN answered ${response.status}`);
      const [best] = ((await response.json()) as BanResponse).features;
      if (!best || best.properties.score < MIN_SCORE) return null;
      const [lng, lat] = best.geometry.coordinates;
      return { label: best.properties.label, location: { lat, lng } };
    },
  };
}
