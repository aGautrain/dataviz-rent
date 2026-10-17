import { createMotisEngine } from "./motis";
import type { TravelTimeEngine } from "./types";

let engine: TravelTimeEngine | null | undefined;

/** The configured engine, or null when MOTIS_URL is unset (feature off). */
export function getTravelTimeEngine(): TravelTimeEngine | null {
  if (engine === undefined) {
    const baseUrl = process.env.MOTIS_URL;
    engine = baseUrl ? createMotisEngine({ baseUrl }) : null;
  }
  return engine;
}
