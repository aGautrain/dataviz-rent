import { describe, expect, it } from "vitest";
import { nextWorkdayArrival } from "@/routing/arrival";
import { createMotisEngine, fastestMinutes } from "@/routing/motis";

describe("nextWorkdayArrival", () => {
  it("skips the weekend and uses the city's summer time", () => {
    // Saturday 17 October 2026, 12:00 in Paris.
    const now = new Date("2026-10-17T10:00:00Z");
    expect(nextWorkdayArrival(now, "Europe/Paris").toISOString()).toBe("2026-10-19T07:00:00.000Z");
    expect(nextWorkdayArrival(now, "Europe/London").toISOString()).toBe("2026-10-19T08:00:00.000Z");
  });

  it("handles the switch to winter time in between", () => {
    // Friday 23 October; clocks go back on Sunday 25.
    const now = new Date("2026-10-23T16:00:00Z");
    expect(nextWorkdayArrival(now, "Europe/Paris").toISOString()).toBe("2026-10-26T08:00:00.000Z");
  });

  it("is the next day on weekdays, even before 9 am", () => {
    const now = new Date("2026-11-03T05:00:00Z");
    expect(nextWorkdayArrival(now, "Europe/Paris").toISOString()).toBe("2026-11-04T08:00:00.000Z");
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
