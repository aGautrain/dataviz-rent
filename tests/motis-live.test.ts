import { describe, expect, it } from "vitest";
import { nextWorkdayArrival } from "@/routing/arrival";
import { createMotisEngine } from "@/routing/motis";

// Runs against a MOTIS server loaded with routing/test/make_fixture.py's
// network (the `routing` CI job). Skipped otherwise.
const url = process.env.MOTIS_TEST_URL;

describe.skipIf(!url)("MOTIS on the fixture network", () => {
  const engine = createMotisEngine({ baseUrl: url ?? "http://localhost:8080" });
  const arriveBy = nextWorkdayArrival(new Date(), "Europe/Paris");
  const eastEnd = { lat: 48.0, lng: 2.097 };

  it("takes the metro for long trips and walks short ones", async () => {
    const [byMetro, onFoot, nowhere] = await engine.travelTimes(
      [
        { lat: 48.0, lng: 2.003 }, // next to stop A, 7 km away
        { lat: 48.0, lng: 2.093 }, // 300 m down the street
        { lat: 48.5, lng: 3.0 }, // no street anywhere near
      ],
      eastEnd,
      arriveBy,
    );
    // Walking the whole street is ~90 min; the metro is 6 min plus walks and wait.
    expect(byMetro).not.toBeNull();
    expect(byMetro!).toBeGreaterThanOrEqual(6);
    expect(byMetro!).toBeLessThanOrEqual(25);
    expect(onFoot).not.toBeNull();
    expect(onFoot!).toBeLessThanOrEqual(8);
    expect(nowhere).toBeNull();
  });
});
