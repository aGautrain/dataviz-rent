import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { activeListings, markUnseenAsRemoved, searchListings, upsertListings } from "@/db/listings";
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

  it("searches by rent, bedrooms, area and furnished", async () => {
    const studio: Listing = { ...sample, sourceId: "43", rooms: 1, areaM2: 18, rent: { amountMinor: 50000, currency: "EUR" } };
    const ukFlat: Listing = { ...sample, sourceId: "44", rooms: null, bedrooms: 2, areaM2: 60, furnished: true, rent: { amountMinor: 110000, currency: "EUR" } };
    await upsertListings(db, [studio, ukFlat]);
    const ids = async (criteria: Omit<Parameters<typeof searchListings>[1], "cityId">) =>
      (await searchListings(db, { cityId: "rennes", ...criteria })).map((l) => l.sourceId).sort();

    expect(await ids({})).toEqual(["42", "43", "44"]);
    expect(await ids({ maxRent: 750 })).toEqual(["42", "43"]);
    expect(await ids({ minRent: 600, maxRent: 1000 })).toEqual(["42"]);
    // A T2 counts as one bedroom, a T1 as a studio.
    expect(await ids({ minBedrooms: 1 })).toEqual(["42", "44"]);
    expect(await ids({ maxBedrooms: 0 })).toEqual(["43"]);
    expect(await ids({ minAreaM2: 40, maxAreaM2: 50 })).toEqual(["42"]);
    expect(await ids({ furnished: true })).toEqual(["44"]);
    expect(await searchListings(db, { cityId: "paris" })).toEqual([]);
  });
});
