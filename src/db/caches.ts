import { and, eq, inArray } from "drizzle-orm";
import type { GeocodeStore } from "@/geocoding/cache";
import type { TravelTimeStore } from "@/routing/cache";
import type { Database } from "./client";
import { geocodeCache, travelTimeCache } from "./schema";

/** Rows per statement, well under Postgres's 65535 parameters. */
const CHUNK = 1000;

function chunks<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let start = 0; start < items.length; start += CHUNK) out.push(items.slice(start, start + CHUNK));
  return out;
}

export function createGeocodeStore(db: Database): GeocodeStore {
  return {
    async get(cityId, query) {
      const [row] = await db
        .select()
        .from(geocodeCache)
        .where(and(eq(geocodeCache.cityId, cityId), eq(geocodeCache.query, query)));
      if (!row) return undefined;
      return row.label === null || row.lat === null || row.lng === null
        ? null
        : { label: row.label, location: { lat: row.lat, lng: row.lng } };
    },
    async put(cityId, query, place) {
      await db
        .insert(geocodeCache)
        .values({
          cityId,
          query,
          label: place?.label ?? null,
          lat: place?.location.lat ?? null,
          lng: place?.location.lng ?? null,
        })
        .onConflictDoNothing();
    },
  };
}

export function createTravelTimeStore(db: Database): TravelTimeStore {
  return {
    async get(arriveBy, destination, origins) {
      const known = new Map<string, number | null>();
      for (const part of chunks(origins)) {
        const rows = await db
          .select({
            origin: travelTimeCache.origin,
            minutes: travelTimeCache.minutes,
          })
          .from(travelTimeCache)
          .where(
            and(
              eq(travelTimeCache.arriveBy, arriveBy),
              eq(travelTimeCache.destination, destination),
              inArray(travelTimeCache.origin, part),
            ),
          );
        for (const row of rows) known.set(row.origin, row.minutes);
      }
      return known;
    },
    async put(arriveBy, destination, minutes) {
      const rows = [...minutes].map(([origin, value]) => ({
        arriveBy,
        destination,
        origin,
        minutes: value,
      }));
      for (const part of chunks(rows)) {
        await db.insert(travelTimeCache).values(part).onConflictDoNothing();
      }
    },
  };
}
