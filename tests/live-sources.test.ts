import { describe, expect, it } from "vitest";
import { createPoliteFetch } from "@/sources/http";
import { ADAPTERS } from "@/sources/registry";
import type { SourceContext } from "@/sources/types";

// Hits the real sites: run by hand with LIVE_SOURCES=1, never in CI.
const live = process.env.LIVE_SOURCES === "1";

const context: SourceContext = { fetch: createPoliteFetch(), log: console.log };

describe.skipIf(!live)("live sources", () => {
  for (const adapter of ADAPTERS) {
    for (const cityId of adapter.cities) {
      it(`${adapter.id} returns usable ${cityId} listings`, { timeout: 60_000 }, async () => {
        const criteria = { cityId, maxRent: 2000 };
        const listings = [];
        for await (const raw of adapter.search(criteria, context)) {
          const listing = adapter.normalize(raw, criteria);
          if (listing) listings.push(listing);
          if (listings.length >= 10) break;
        }
        console.log(adapter.id, cityId, JSON.stringify(listings[0], null, 2));
        expect(listings.length).toBeGreaterThan(0);
        for (const listing of listings) {
          expect(listing.rent.amountMinor).toBeGreaterThan(0);
          expect(listing.rent.amountMinor).toBeLessThanOrEqual(200_000);
          expect(listing.url).toMatch(/^https:\/\//);
        }
        expect(listings.some((listing) => listing.location !== null)).toBe(true);
      });
    }
  }
});
