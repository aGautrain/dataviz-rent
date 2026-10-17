import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { activeListings } from "@/db/listings";
import type { Listing } from "@/domain/listing";
import { collectAll, collectFrom } from "@/sources/collect";
import type { SourceAdapter, SourceContext } from "@/sources/types";

// Runs only against a disposable database: TEST_DATABASE_URL is wiped.
const url = process.env.TEST_DATABASE_URL;

interface FakeRaw {
  id: string;
  price: number | null;
}

function fakeAdapter(records: FakeRaw[], options: { failAfter?: number } = {}): SourceAdapter<FakeRaw> {
  return {
    id: "fake",
    name: "Fake",
    cities: ["rennes"],
    async *search() {
      let i = 0;
      for (const record of records) {
        if (options.failAfter !== undefined && i++ >= options.failAfter) throw new Error("site down");
        yield record;
      }
    },
    normalize(raw): Listing | null {
      if (raw.price === null) return null;
      return {
        source: "fake",
        sourceId: raw.id,
        url: `https://fake.example/${raw.id}`,
        country: "FR",
        cityId: "rennes",
        title: `Annonce ${raw.id}`,
        rent: { amountMinor: raw.price * 100, currency: "EUR" },
        chargesIncluded: null,
        areaM2: null,
        bedrooms: null,
        rooms: 2,
        furnished: null,
        location: null,
        locationPrecision: null,
        address: null,
        photoUrl: null,
        publishedAt: null,
      };
    },
    buildSearchUrl: () => "https://fake.example/search",
  };
}

const context: SourceContext = { fetch, log: () => {} };
const target = { criteria: { cityId: "rennes" as const }, maxItems: 10 };

describe.skipIf(!url)("collection pipeline", () => {
  const client = postgres(url ?? "", { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema });
  const ids = async () => (await activeListings(db, ["rennes"])).map((l) => l.sourceId).sort();

  beforeAll(async () => {
    await client`drop schema if exists public cascade`;
    await client`drop schema if exists drizzle cascade`;
    await client`create schema public`;
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  });

  beforeEach(async () => {
    await client`truncate listings`;
  });

  afterAll(async () => {
    await client.end();
  });

  it("saves normalized listings, skipping unusable and repeated records", async () => {
    const result = await collectFrom(
      db,
      fakeAdapter([
        { id: "a", price: 700 },
        { id: "b", price: null },
        { id: "a", price: 700 },
        { id: "c", price: 900 },
      ]),
      target,
      context,
    );
    expect(result).toMatchObject({ read: 4, kept: 2, removed: 0, truncated: false });
    expect(await ids()).toEqual(["a", "c"]);
  });

  it("marks listings missing from a complete run as removed", async () => {
    await collectFrom(db, fakeAdapter([{ id: "a", price: 700 }, { id: "c", price: 900 }]), target, context);
    const result = await collectFrom(db, fakeAdapter([{ id: "c", price: 900 }]), target, context);
    expect(result.removed).toBe(1);
    expect(await ids()).toEqual(["c"]);
  });

  it("never removes anything after a failed or truncated run", async () => {
    await collectFrom(db, fakeAdapter([{ id: "a", price: 700 }, { id: "c", price: 900 }]), target, context);

    const failed = await collectFrom(
      db,
      fakeAdapter([{ id: "x", price: 500 }, { id: "y", price: 500 }], { failAfter: 1 }),
      target,
      context,
    );
    expect(failed.error).toBe("site down");
    expect(failed.removed).toBe(0);

    const truncated = await collectFrom(
      db,
      fakeAdapter([{ id: "x", price: 500 }, { id: "y", price: 500 }]),
      { ...target, maxItems: 1 },
      context,
    );
    expect(truncated).toMatchObject({ truncated: true, removed: 0 });
    expect(await ids()).toEqual(["a", "c", "x"]);
  });

  it("only runs adapters that cover the target city", async () => {
    const results = await collectAll(
      db,
      [fakeAdapter([{ id: "a", price: 700 }])],
      [target, { criteria: { cityId: "london" }, maxItems: 10 }],
      context,
    );
    expect(results.map((r) => r.cityId)).toEqual(["rennes"]);
  });
});
