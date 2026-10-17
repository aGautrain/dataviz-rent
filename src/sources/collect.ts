import type { Database } from "@/db/client";
import { markUnseenAsRemoved, upsertListings } from "@/db/listings";
import type { Listing } from "@/domain/listing";
import type { SearchCriteria } from "@/domain/search";
import { SearchTruncated, type SourceAdapter, type SourceContext } from "./types";

export interface CollectionTarget {
  /** Broad criteria covering everything we keep for a city. */
  criteria: SearchCriteria;
  /** Safety cap on records read per source, so a runaway pagination stops. */
  maxItems: number;
}

export interface CollectionResult {
  source: string;
  cityId: string;
  read: number;
  kept: number;
  removed: number;
  /** True when our cap or the site's own limit stopped the run early. */
  truncated: boolean;
  error?: string;
}

const BATCH_SIZE = 100;

/**
 * Runs one adapter for one city: reads every record, normalizes it, saves it.
 * Listings the source no longer returns are marked removed, but only after a
 * complete run: a failed or truncated run never hides anything.
 */
export async function collectFrom(
  db: Database,
  adapter: SourceAdapter,
  target: CollectionTarget,
  context: SourceContext,
): Promise<CollectionResult> {
  const { criteria, maxItems } = target;
  const result: CollectionResult = {
    source: adapter.id,
    cityId: criteria.cityId,
    read: 0,
    kept: 0,
    removed: 0,
    truncated: false,
  };
  const startedAt = new Date();
  const seen = new Set<string>();
  let batch: Listing[] = [];

  const flush = async () => {
    if (batch.length === 0) return;
    await upsertListings(db, batch);
    batch = [];
  };

  try {
    for await (const raw of adapter.search(criteria, context)) {
      if (result.read >= maxItems) {
        result.truncated = true;
        break;
      }
      result.read++;
      const listing = adapter.normalize(raw, criteria);
      // Sites repeat sponsored listings across pages.
      if (!listing || seen.has(listing.sourceId)) continue;
      seen.add(listing.sourceId);
      batch.push(listing);
      result.kept++;
      if (batch.length >= BATCH_SIZE) await flush();
    }
    await flush();
    if (!result.truncated) {
      result.removed = await markUnseenAsRemoved(db, adapter.id, criteria.cityId, startedAt);
    }
  } catch (error) {
    await flush().catch(() => {});
    if (error instanceof SearchTruncated) result.truncated = true;
    else result.error = error instanceof Error ? error.message : String(error);
  }

  context.log(
    `${adapter.id}/${criteria.cityId}: read ${result.read}, kept ${result.kept}, removed ${result.removed}` +
      (result.truncated ? " (truncated)" : "") +
      (result.error ? `, error: ${result.error}` : ""),
  );
  return result;
}

/** Runs every adapter that covers each target's city, one after the other. */
export async function collectAll(
  db: Database,
  adapters: readonly SourceAdapter[],
  targets: readonly CollectionTarget[],
  context: SourceContext,
): Promise<CollectionResult[]> {
  const results: CollectionResult[] = [];
  for (const target of targets) {
    for (const adapter of adapters) {
      if (adapter.collect === false || !adapter.cities.includes(target.criteria.cityId)) continue;
      results.push(await collectFrom(db, adapter, target, context));
    }
  }
  return results;
}
