import type { Geocoder } from "./types";

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

/**
 * OpenStreetMap's Nominatim, for the UK. Its usage policy asks for an
 * identifying User-Agent and at most one request per second; the caller caches
 * results, and a beta's testers stay far below that.
 */
export function createNominatimGeocoder(fetchImpl: typeof fetch = fetch): Geocoder {
  return {
    async geocode(query, near) {
      const [west, south, east, north] = near.bbox;
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("q", query);
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("limit", "1");
      url.searchParams.set("countrycodes", near.country.toLowerCase());
      url.searchParams.set("viewbox", `${west},${north},${east},${south}`);
      const response = await fetchImpl(url, {
        headers: { "user-agent": "DatavizRent beta (https://rent.ratelteam.fr)" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`Nominatim answered ${response.status}`);
      const [best] = (await response.json()) as NominatimResult[];
      if (!best) return null;
      return {
        // display_name runs down to the country; the first parts are enough.
        label: best.display_name.split(", ").slice(0, 3).join(", "),
        location: { lat: Number(best.lat), lng: Number(best.lon) },
      };
    },
  };
}
