import type { CityId } from "@/domain/countries";
import type { Listing } from "@/domain/listing";
import type { SearchCriteria } from "@/domain/search";

/** What the collection pipeline hands to an adapter. */
export interface SourceContext {
  /** Polite HTTP client: per-host rate limit, timeout, retries. */
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  log: (message: string) => void;
}

/**
 * The contract every listing site implements. The rest of the app (collection,
 * search, alerts) only ever talks to this interface, so supporting a new site
 * means writing one adapter and adding it to the registry.
 *
 * `Raw` is the site's own record shape; it never leaves the adapter.
 */
export interface SourceAdapter<Raw = unknown> {
  /** Stable identifier, stored with every listing. */
  id: string;
  /** Display name, e.g. on "Create an alert on …" buttons. */
  name: string;
  /** Cities this site covers. */
  cities: readonly CityId[];

  /** Yields the site's raw records matching the criteria, page after page. */
  search(criteria: SearchCriteria, context: SourceContext): AsyncIterable<Raw>;

  /**
   * Converts one raw record to the common format. Returns null for records
   * that are not usable rentals (no price, wrong city, a parking space…).
   */
  normalize(raw: Raw, criteria: SearchCriteria): Listing | null;

  /**
   * The site's own search page with the criteria pre-filled, where the user
   * can create an alert on the site itself (alerts v0.1).
   */
  buildSearchUrl(criteria: SearchCriteria): string;
}

/**
 * Thrown by `search` when the site stops serving results before the end (most
 * sites cap pagination). Collection keeps what was read but, not having seen
 * everything, does not mark missing listings as removed.
 */
export class SearchTruncated extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SearchTruncated";
  }
}
