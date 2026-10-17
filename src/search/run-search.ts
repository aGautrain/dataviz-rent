import type { Database } from "@/db/client";
import { searchListings } from "@/db/listings";
import type { CityConfig } from "@/domain/countries";
import type { Listing } from "@/domain/listing";
import type { CommuteCriteria, SearchCriteria } from "@/domain/search";
import type { Place } from "@/geocoding";
import { nextWorkdayArrival } from "@/routing/arrival";
import type { TravelTimeEngine } from "@/routing/types";

export interface SearchHit {
  listing: Listing;
  /** Door-to-door minutes to the commute address, when one was given. */
  minutes: number | null;
}

export type CommuteProblem =
  | "address-not-found"
  | "geocoding-unavailable"
  /** No travel-time engine configured, or it failed: results are unfiltered. */
  | "travel-times-unavailable";

export interface SearchOutcome {
  hits: SearchHit[];
  /** True when more listings matched than are shown. */
  truncated: boolean;
  destination: Place | null;
  commuteProblem: CommuteProblem | null;
}

export interface SearchDeps {
  db: Database;
  geocode: (query: string, city: CityConfig) => Promise<Place | null>;
  engine: TravelTimeEngine | null;
  now: () => Date;
  log?: (message: string) => void;
}

/** Listings considered for travel times; above this the newest are kept. */
const MAX_ROUTED = 5000;

export async function runSearch(
  criteria: SearchCriteria,
  commute: CommuteCriteria | null,
  city: CityConfig,
  limit: number,
  deps: SearchDeps,
): Promise<SearchOutcome> {
  const plain = async (destination: Place | null, problem: CommuteProblem | null) => {
    const listings = await searchListings(deps.db, criteria, limit + 1);
    return {
      hits: listings.slice(0, limit).map((listing) => ({ listing, minutes: null })),
      truncated: listings.length > limit,
      destination,
      commuteProblem: problem,
    };
  };

  if (!commute) return plain(null, null);
  let destination: Place | null;
  try {
    destination = await deps.geocode(commute.to, city);
  } catch (error) {
    deps.log?.(`[search] geocoding failed: ${error instanceof Error ? error.message : error}`);
    return plain(null, "geocoding-unavailable");
  }
  if (!destination) return plain(null, "address-not-found");
  if (!deps.engine) return plain(destination, "travel-times-unavailable");

  const candidates = (await searchListings(deps.db, criteria, MAX_ROUTED)).filter(
    (listing) => listing.location !== null,
  );
  let minutes: (number | null)[];
  try {
    minutes = await deps.engine.travelTimes(
      candidates.map((listing) => listing.location!),
      destination.location,
      nextWorkdayArrival(deps.now(), city.timeZone),
    );
  } catch (error) {
    deps.log?.(`[search] travel times failed: ${error instanceof Error ? error.message : error}`);
    return plain(destination, "travel-times-unavailable");
  }

  const max = commute.maxMinutes;
  const hits = candidates
    .map((listing, index) => ({ listing, minutes: minutes[index] }))
    .filter((hit) => max === undefined || (hit.minutes !== null && hit.minutes <= max))
    // Closest first; listings with no route found go last.
    .sort((a, b) => (a.minutes ?? Infinity) - (b.minutes ?? Infinity));
  return {
    hits: hits.slice(0, limit),
    truncated: hits.length > limit,
    destination,
    commuteProblem: null,
  };
}
