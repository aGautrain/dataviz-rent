import type { LatLng } from "@/domain/countries";
import type { TravelTimeEngine } from "./types";

export function positionKey(point: LatLng): string {
  // ~10 m: finer than any listing position we get.
  return `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;
}

/** Lasting storage for travel times (the database), shared by every process. */
export interface TravelTimeStore {
  /** The minutes known for these origins; origins never routed are absent. */
  get(arriveBy: Date, destination: string, origins: string[]): Promise<Map<string, number | null>>;
  put(arriveBy: Date, destination: string, minutes: Map<string, number | null>): Promise<void>;
}

/**
 * Remembers travel times per destination and arrival time, so changing the
 * rent or size filters of a search only routes listings not seen before.
 * Recent destinations stay in memory; with a store, every time computed is
 * also kept there and survives restarts. Matters on a small server, where each
 * MOTIS request can take seconds.
 */
export function withTravelTimeCache(
  engine: TravelTimeEngine,
  { maxDestinations = 50, store }: { maxDestinations?: number; store?: TravelTimeStore } = {},
): TravelTimeEngine {
  const byDestination = new Map<string, Map<string, number | null>>();

  return {
    async travelTimes(origins, destination, arriveBy) {
      const destinationKey = positionKey(destination);
      const cacheKey = `${destinationKey}@${arriveBy.toISOString()}`;
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

      const unknown = () =>
        [...new Map(origins.map((origin) => [positionKey(origin), origin])).entries()].filter(
          ([originKey]) => !known.has(originKey),
        );
      let missing = unknown();
      if (missing.length > 0 && store) {
        const stored = await store.get(
          arriveBy,
          destinationKey,
          missing.map(([originKey]) => originKey),
        );
        stored.forEach((minutes, originKey) => known.set(originKey, minutes));
        missing = unknown();
      }
      if (missing.length > 0) {
        const minutes = await engine.travelTimes(
          missing.map(([, origin]) => origin),
          destination,
          arriveBy,
        );
        const routed = new Map(missing.map(([originKey], index) => [originKey, minutes[index]]));
        routed.forEach((value, originKey) => known.set(originKey, value));
        await store?.put(arriveBy, destinationKey, routed);
      }
      return origins.map((origin) => known.get(positionKey(origin)) ?? null);
    },
  };
}
