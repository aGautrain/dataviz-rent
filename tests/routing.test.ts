import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TIMETABLE_DAYS, arrivalOn, timetableArrival } from "@/routing/arrival";
import { withTravelTimeCache, type TravelTimeStore } from "@/routing/cache";
import { createMotisEngine, fastestMinutes } from "@/routing/motis";

describe("timetable days", () => {
  const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

  it("are weekdays inside the days MOTIS loads", () => {
    const config = read("routing/config.yml");
    const first = config.match(/^  first_day: "(.+)"$/m)![1];
    const count = Number(config.match(/^  num_days: (\d+)$/m)![1]);
    for (const day of Object.values(TIMETABLE_DAYS)) {
      const offset = (Date.parse(day) - Date.parse(first)) / 86_400_000;
      expect(offset).toBeGreaterThanOrEqual(0);
      expect(offset).toBeLessThan(count);
      expect([1, 2, 3, 4, 5]).toContain(new Date(`${day}T12:00:00Z`).getUTCDay());
    }
  });

  it("are the days prepare.sh checks the timetables against", () => {
    const prepare = read("routing/prepare.sh");
    for (const [country, day] of Object.entries(TIMETABLE_DAYS)) {
      expect(prepare).toMatch(new RegExp(`^${country}_DAY=${day}$`, "m"));
    }
  });

  it("arrive at 9 am in the city's time zone", () => {
    // Summer time: Paris is UTC+2, London UTC+1.
    expect(timetableArrival({ country: "FR", timeZone: "Europe/Paris" }).toISOString()).toBe(
      "2026-10-15T07:00:00.000Z",
    );
    expect(timetableArrival({ country: "GB", timeZone: "Europe/London" }).toISOString()).toBe(
      "2026-10-19T08:00:00.000Z",
    );
    // Winter time.
    expect(arrivalOn("2026-11-02", "Europe/Paris").toISOString()).toBe("2026-11-02T08:00:00.000Z");
    expect(arrivalOn("2026-11-02", "Europe/London").toISOString()).toBe("2026-11-02T09:00:00.000Z");
  });
});

describe("fastestMinutes", () => {
  it("takes the quickest of walking and transit, rounded up", () => {
    expect(fastestMinutes({ duration: 1500 }, [{ duration: 1260 }, { duration: 1800 }])).toBe(21);
    expect(fastestMinutes({ duration: 600 }, [{ duration: 1200 }])).toBe(10);
    expect(fastestMinutes({}, [])).toBeNull();
    expect(fastestMinutes(undefined, undefined)).toBeNull();
  });
});

describe("MOTIS engine", () => {
  it("asks many-to-one in batches and keeps the origins' order", async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      expect(url).toBe("http://motis:8080/api/experimental/one-to-many-intermodal");
      const body = JSON.parse(String(init.body));
      bodies.push(body);
      return Response.json({
        street_durations: body.many.map(() => ({})),
        transit_durations: body.many.map((_: string, index: number) =>
          body.many[index] === "48.2,2.2" ? [] : [{ duration: (index + 1) * 600, transfers: 0 }],
        ),
      });
    }) as unknown as typeof fetch;

    const engine = createMotisEngine({ baseUrl: "http://motis:8080", batchSize: 2, fetchImpl });
    const arriveBy = new Date("2026-10-19T07:00:00Z");
    const minutes = await engine.travelTimes(
      [
        { lat: 48.1, lng: 2.1 },
        { lat: 48.2, lng: 2.2 },
        { lat: 48.3, lng: 2.3 },
      ],
      { lat: 48.85, lng: 2.35 },
      arriveBy,
    );

    expect(minutes).toEqual([10, null, 10]);
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toMatchObject({
      one: "48.85,2.35",
      many: ["48.1,2.1", "48.2,2.2"],
      arriveBy: true,
      time: "2026-10-19T07:00:00.000Z",
    });
  });

  it("reports MOTIS errors", async () => {
    const fetchImpl = (async () => new Response("boom", { status: 500 })) as unknown as typeof fetch;
    const engine = createMotisEngine({ baseUrl: "http://motis:8080", fetchImpl });
    await expect(engine.travelTimes([{ lat: 1, lng: 1 }], { lat: 2, lng: 2 }, new Date())).rejects.toThrow(
      "MOTIS answered 500",
    );
  });
});

describe("travel time cache", () => {
  it("only routes origins it hasn't seen for this destination and time", async () => {
    const calls: number[] = [];
    const engine = withTravelTimeCache({
      async travelTimes(origins) {
        calls.push(origins.length);
        return origins.map((origin) => (origin.lng > 10 ? null : Math.round(origin.lng)));
      },
    });
    const to = { lat: 0, lng: 0 };
    const monday = new Date("2026-10-19T07:00:00Z");
    const a = { lat: 1, lng: 1 };
    const b = { lat: 2, lng: 2 };
    const far = { lat: 3, lng: 20 };

    expect(await engine.travelTimes([a, far], to, monday)).toEqual([1, null]);
    expect(await engine.travelTimes([b, a, far, b], to, monday)).toEqual([2, 1, null, 2]);
    expect(calls).toEqual([2, 1]);

    // Another arrival time or destination is routed again.
    await engine.travelTimes([a], to, new Date("2026-10-20T07:00:00Z"));
    await engine.travelTimes([a], { lat: 5, lng: 5 }, monday);
    expect(calls).toEqual([2, 1, 1, 1]);
  });

  it("reads and fills the store, so a restart routes nothing again", async () => {
    const rows = new Map<string, number | null>();
    const rowKey = (arriveBy: Date, destination: string, origin: string) =>
      `${arriveBy.toISOString()}|${destination}|${origin}`;
    const store: TravelTimeStore = {
      async get(arriveBy, destination, origins) {
        const known = origins.filter((origin) => rows.has(rowKey(arriveBy, destination, origin)));
        return new Map(known.map((origin) => [origin, rows.get(rowKey(arriveBy, destination, origin))!]));
      },
      async put(arriveBy, destination, minutes) {
        minutes.forEach((value, origin) => rows.set(rowKey(arriveBy, destination, origin), value));
      },
    };
    const calls: number[] = [];
    const motis = {
      async travelTimes(origins: { lat: number; lng: number }[]) {
        calls.push(origins.length);
        return origins.map((origin) => (origin.lng > 10 ? null : Math.round(origin.lng)));
      },
    };
    const to = { lat: 0, lng: 0 };
    const monday = new Date("2026-11-02T08:00:00Z");
    const a = { lat: 1, lng: 1 };
    const far = { lat: 3, lng: 20 };

    expect(await withTravelTimeCache(motis, { store }).travelTimes([a, far], to, monday)).toEqual([1, null]);
    expect(rows.get(rowKey(monday, "0.0000,0.0000", "3.0000,20.0000"))).toBeNull();
    // A new process: empty memory, same store.
    const restarted = withTravelTimeCache(motis, { store });
    expect(await restarted.travelTimes([far, a, { lat: 2, lng: 2 }], to, monday)).toEqual([null, 1, 2]);
    expect(calls).toEqual([2, 1]);
  });
});
