import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { activeListings, markUnseenAsRemoved, upsertListings } from "@/db/listings";
import type { Listing } from "@/domain/listing";

// Runs only against a disposable database: TEST_DATABASE_URL is wiped.
const url = process.env.TEST_DATABASE_URL;

const sample: Listing = {
  source: "test",
  sourceId: "42",
  url: "https://example.com/42",
  country: "FR",
  cityId: "rennes",
  title: "T2 lumineux centre",
  rent: { amountMinor: 75000, currency: "EUR" },
  chargesIncluded: true,
  areaM2: 42,
  bedrooms: null,
  rooms: 2,
  furnished: false,
  location: { lat: 48.111, lng: -1.68 },
  locationPrecision: "street",
  address: "Rue de la Monnaie, Rennes",
  photoUrl: null,
  publishedAt: new Date("2026-10-01T10:00:00Z"),
};

describe.skipIf(!url)("listings repository", () => {
  const client = postgres(url ?? "", { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema });

  beforeAll(async () => {
    await client`drop schema if exists public cascade`;
    await client`drop schema if exists drizzle cascade`;
    await client`create schema public`;
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  });

  afterAll(async () => {
    await client.end();
  });

  it("round-trips a listing, including its location", async () => {
    await upsertListings(db, [sample]);
    expect(await activeListings(db, ["rennes"])).toEqual([sample]);
  });

  it("updates a listing seen again instead of duplicating it", async () => {
    await upsertListings(db, [{ ...sample, rent: { amountMinor: 72000, currency: "EUR" } }]);
    const rows = await activeListings(db, ["rennes"]);
    expect(rows).toHaveLength(1);
    expect(rows[0].rent.amountMinor).toBe(72000);
  });

  it("hides listings that disappeared from their source", async () => {
    const removed = await markUnseenAsRemoved(db, "test", "rennes", new Date(Date.now() + 1000));
    expect(removed).toBe(1);
    expect(await activeListings(db, ["rennes"])).toEqual([]);

    await upsertListings(db, [sample]);
    expect(await activeListings(db, ["rennes"])).toHaveLength(1);
  });
});
