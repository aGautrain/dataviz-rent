import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { upsertListings } from "@/db/listings";
import { getCity, type CityConfig, type LatLng } from "@/domain/countries";
import type { Listing } from "@/domain/listing";
import { runSearch, type SearchDeps } from "@/search/run-search";

// Runs only against a disposable database: TEST_DATABASE_URL is wiped.
const url = process.env.TEST_DATABASE_URL;
const rennes = getCity("rennes") as CityConfig;

function listing(sourceId: string, lng: number | null, publishedAt: string): Listing {
  return {
    source: "test",
    sourceId,
    url: `https://example.com/${sourceId}`,
    country: "FR",
    cityId: "rennes",
    title: `Annonce ${sourceId}`,
    rent: { amountMinor: 70000, currency: "EUR" },
    chargesIncluded: true,
    areaM2: 40,
    bedrooms: null,
    rooms: 2,
    furnished: false,
    location: lng === null ? null : { lat: 48.11, lng },
    locationPrecision: lng === null ? null : "street",
    address: null,
    photoUrl: null,
    publishedAt: new Date(publishedAt),
  };
}

const station = { label: "Gare de Rennes", location: { lat: 48.1035, lng: -1.6726 } };

describe.skipIf(!url)("runSearch", () => {
  const client = postgres(url ?? "", { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema });
  // Fake engine: one minute per 0.001° of longitude away from the station.
  const engine = {
    async travelTimes(origins: LatLng[]) {
      return origins.map((origin) =>
        origin.lng > -1.6 ? null : Math.round(Math.abs(origin.lng - station.location.lng) * 1000),
      );
    },
  };
  const deps = (overrides: Partial<SearchDeps> = {}): SearchDeps => ({
    db,
    geocode: async () => station,
    engine,
    ...overrides,
  });

  beforeAll(async () => {
    await client`drop schema if exists public cascade`;
    await client`drop schema if exists drizzle cascade`;
    await client`create schema public`;
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
    await upsertListings(db, [
      listing("far", -1.7126, "2026-10-16T10:00:00Z"), // 40 min
      listing("near", -1.6826, "2026-10-10T10:00:00Z"), // 10 min
      listing("unreachable", -1.5, "2026-10-15T10:00:00Z"),
      listing("unplaced", null, "2026-10-17T09:00:00Z"),
    ]);
  });

  afterAll(async () => {
    await client.end();
  });

  const ids = (outcome: Awaited<ReturnType<typeof runSearch>>) =>
    outcome.hits.map((hit) => [hit.listing.sourceId, hit.minutes]);

  it("lists the newest first without a commute address", async () => {
    const outcome = await runSearch({ cityId: "rennes" }, null, rennes, 10, deps());
    expect(ids(outcome)).toEqual([
      ["unplaced", null],
      ["far", null],
      ["unreachable", null],
      ["near", null],
    ]);
    expect(outcome.truncated).toBe(false);
  });

  it("sorts by travel time and applies the maximum", async () => {
    const all = await runSearch({ cityId: "rennes" }, { to: "gare" }, rennes, 10, deps());
    expect(ids(all)).toEqual([
      ["near", 10],
      ["far", 40],
      ["unreachable", null],
    ]);
    expect(all.destination).toEqual(station);

    const capped = await runSearch({ cityId: "rennes" }, { to: "gare", maxMinutes: 30 }, rennes, 10, deps());
    expect(ids(capped)).toEqual([["near", 10]]);
  });

  it("marks truncated results", async () => {
    const outcome = await runSearch({ cityId: "rennes" }, { to: "gare" }, rennes, 1, deps());
    expect(ids(outcome)).toEqual([["near", 10]]);
    expect(outcome.truncated).toBe(true);
  });

  it("falls back to plain results when the address or the engine fails", async () => {
    const unknown = await runSearch({ cityId: "rennes" }, { to: "?" }, rennes, 10, deps({ geocode: async () => null }));
    expect(unknown.commuteProblem).toBe("address-not-found");
    expect(unknown.hits).toHaveLength(4);

    const noEngine = await runSearch({ cityId: "rennes" }, { to: "gare" }, rennes, 10, deps({ engine: null }));
    expect(noEngine.commuteProblem).toBe("travel-times-unavailable");
    expect(noEngine.destination).toEqual(station);

    const broken = await runSearch(
      { cityId: "rennes" },
      { to: "gare" },
      rennes,
      10,
      deps({ engine: { travelTimes: async () => Promise.reject(new Error("down")) } }),
    );
    expect(broken.commuteProblem).toBe("travel-times-unavailable");
    expect(broken.hits).toHaveLength(4);

    const geocoderDown = await runSearch(
      { cityId: "rennes" },
      { to: "gare" },
      rennes,
      10,
      deps({ geocode: async () => Promise.reject(new Error("down")) }),
    );
    expect(geocoderDown.commuteProblem).toBe("geocoding-unavailable");
  });
});
