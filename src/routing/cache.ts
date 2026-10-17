import type { LatLng } from "@/domain/countries";
import type { TravelTimeEngine } from "./types";

function key(point: LatLng): string {
  // ~10 m: finer than any listing position we get.
  return `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;
}

/**
 * Remembers travel times per destination and arrival time, so changing the
 * rent or size filters of a search only routes listings not seen before.
 * Matters on a small server, where each MOTIS request can take seconds.
 */
export function withTravelTimeCache(
  engine: TravelTimeEngine,
  maxDestinations = 50,
): TravelTimeEngine {
  const byDestination = new Map<string, Map<string, number | null>>();

  return {
    async travelTimes(origins, destination, arriveBy) {
      const cacheKey = `${key(destination)}@${arriveBy.toISOString()}`;
      let known = byDestination.get(cacheKey);
      if (known) {
        byDestination.delete(cacheKey); // re-inserted below: most recent last
      } else {
        known = new Map();
        if (byDestination.size >= maxDestinations) {
          byDestination.delete(byDestination.keys().next().value!);
        }
      }
      byDestination.set(cacheKey, known);

      const missing = [...new Map(origins.map((origin) => [key(origin), origin])).entries()]
        .filter(([originKey]) => !known.has(originKey));
      if (missing.length > 0) {
        const minutes = await engine.travelTimes(
          missing.map(([, origin]) => origin),
          destination,
          arriveBy,
        );
        missing.forEach(([originKey], index) => known.set(originKey, minutes[index]));
      }
      return origins.map((origin) => known.get(key(origin)) ?? null);
    },
  };
}
