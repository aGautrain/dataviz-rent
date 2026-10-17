import { describe, expect, it } from "vitest";
import { ADAPTERS, adaptersFor, alertLinks } from "@/sources/registry";
import { CITIES } from "@/domain/countries";
import { COLLECTION_TARGETS } from "@/sources/targets";

describe("source registry", () => {
  it("covers every beta city with at least one site", () => {
    for (const city of CITIES) expect(adaptersFor(city.id).length).toBeGreaterThan(0);
  });

  it("has unique adapter ids", () => {
    const ids = ADAPTERS.map((adapter) => adapter.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("builds one alert link per site covering the city", () => {
    expect(alertLinks({ cityId: "london", maxRent: 1800 })).toEqual([
      expect.objectContaining({ source: "rightmove", name: "Rightmove" }),
    ]);
  });

  it("collects every beta city", () => {
    expect(COLLECTION_TARGETS.map((t) => t.criteria.cityId).sort()).toEqual(CITIES.map((c) => c.id).sort());
  });
});
