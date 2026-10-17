import type { LatLng } from "@/domain/countries";

/**
 * Door-to-door public transport times. The app only talks to this interface,
 * so the engine behind it (MOTIS today) can be swapped without touching search.
 */
export interface TravelTimeEngine {
  /**
   * Minutes from each origin to the destination, walking included, arriving
   * by `arriveBy`. Same order as `origins`; null when no route was found.
   */
  travelTimes(origins: LatLng[], destination: LatLng, arriveBy: Date): Promise<(number | null)[]>;
}
