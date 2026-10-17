import type { LatLng } from "@/domain/countries";
import type { TravelTimeEngine } from "./types";

/** Subset of MOTIS's OneToManyIntermodalResponse that we read. */
interface OneToManyIntermodalResponse {
  street_durations?: { duration?: number }[];
  transit_durations?: { duration: number; transfers: number }[][];
}

export interface MotisOptions {
  baseUrl: string;
  /** Must not exceed `limits.onetomany_max_many` in the MOTIS config. */
  batchSize?: number;
  /** Routes longer than this are not searched for (keeps queries fast). */
  maxTravelMinutes?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

function coordinate(point: LatLng): string {
  return `${point.lat},${point.lng}`;
}

/** Fastest of walking all the way and the best transit option, in whole minutes. */
export function fastestMinutes(
  street: { duration?: number } | undefined,
  transit: { duration: number }[] | undefined,
): number | null {
  const candidates = [street?.duration, ...(transit ?? []).map((option) => option.duration)].filter(
    (seconds): seconds is number => typeof seconds === "number",
  );
  if (candidates.length === 0) return null;
  return Math.ceil(Math.min(...candidates) / 60);
}

/**
 * MOTIS 2 (https://github.com/motis-project/motis), self-hosted. One
 * many-to-one request per batch of listings: MOTIS searches once from the
 * destination, so a whole city costs a handful of requests.
 */
export function createMotisEngine(options: MotisOptions): TravelTimeEngine {
  const {
    baseUrl,
    batchSize = 1000,
    maxTravelMinutes = 120,
    timeoutMs = 30_000,
    fetchImpl = fetch,
  } = options;
  const endpoint = new URL("/api/experimental/one-to-many-intermodal", baseUrl).toString();

  async function batch(origins: LatLng[], destination: LatLng, arriveBy: Date) {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        one: coordinate(destination),
        many: origins.map(coordinate),
        time: arriveBy.toISOString(),
        arriveBy: true,
        maxTravelTime: maxTravelMinutes,
        maxDirectTime: maxTravelMinutes * 60,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`MOTIS answered ${response.status}: ${(await response.text()).slice(0, 200)}`);
    }
    const body = (await response.json()) as OneToManyIntermodalResponse;
    return origins.map((_, index) =>
      fastestMinutes(body.street_durations?.[index], body.transit_durations?.[index]),
    );
  }

  return {
    async travelTimes(origins, destination, arriveBy) {
      const results: (number | null)[] = [];
      for (let start = 0; start < origins.length; start += batchSize) {
        results.push(...(await batch(origins.slice(start, start + batchSize), destination, arriveBy)));
      }
      return results;
    },
  };
}
