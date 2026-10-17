import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { createGeocodeStore, createTravelTimeStore } from "@/db/caches";

// Runs only against a disposable database: TEST_DATABASE_URL is wiped.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("database caches", () => {
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

  it("keeps geocoder answers, including addresses not found", async () => {
    const store = createGeocodeStore(db);
    const station = {
      label: "Gare de Rennes",
      location: { lat: 48.1035, lng: -1.6726 },
    };
    expect(await store.get("rennes", "gare")).toBeUndefined();
    await store.put("rennes", "gare", station);
    await store.put("rennes", "nowhere", null);
    await store.put("rennes", "gare", null); // a later answer never overwrites
    expect(await store.get("rennes", "gare")).toEqual(station);
    expect(await store.get("rennes", "nowhere")).toBeNull();
    expect(await store.get("paris", "gare")).toBeUndefined();
  });

  it("keeps travel times per arrival and destination, in chunks", async () => {
    const store = createTravelTimeStore(db);
    const monday = new Date("2026-11-02T08:00:00Z");
    const many = new Map(Array.from({ length: 2500 }, (_, i) => [`o${i}`, i % 7 === 0 ? null : i % 100]));
    await store.put(monday, "d1", many);
    await store.put(monday, "d1", new Map([["o1", 99]]));

    const known = await store.get(monday, "d1", ["o0", "o1", "o2498", "unseen"]);
    expect(Object.fromEntries(known)).toEqual({ o0: null, o1: 1, o2498: 98 });
    expect((await store.get(monday, "d1", [...many.keys()])).size).toBe(2500);
    expect((await store.get(monday, "d2", ["o1"])).size).toBe(0);
    expect((await store.get(new Date("2026-11-03T08:00:00Z"), "d1", ["o1"])).size).toBe(0);
  });
});
