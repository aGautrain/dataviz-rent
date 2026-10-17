import { createTravelTimeStore } from "@/db/caches";
import { getDb } from "@/db/client";
import { withTravelTimeCache } from "./cache";
import { createMotisEngine } from "./motis";
import type { TravelTimeEngine } from "./types";

let engine: TravelTimeEngine | null | undefined;

/** The configured engine, or null when MOTIS_URL is unset (feature off). */
export function getTravelTimeEngine(): TravelTimeEngine | null {
  if (engine === undefined) {
    const baseUrl = process.env.MOTIS_URL;
    engine = baseUrl
      ? withTravelTimeCache(
          // Generous timeout: on the small VPS, MOTIS may page data in from disk.
          createMotisEngine({ baseUrl, timeoutMs: Number(process.env.MOTIS_TIMEOUT_MS) || 120_000 }),
          { store: createTravelTimeStore(getDb()) },
        )
      : null;
  }
  return engine;
}
