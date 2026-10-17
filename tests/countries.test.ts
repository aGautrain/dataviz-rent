import { describe, expect, it } from "vitest";
import { CITIES, citiesOf, getCity, isCountryCode } from "@/domain/countries";

describe("countries", () => {
  it("knows the beta cities", () => {
    expect(CITIES.map((city) => city.id)).toEqual(["paris", "rennes", "london"]);
    expect(citiesOf("FR").map((city) => city.id)).toEqual(["paris", "rennes"]);
    expect(citiesOf("GB").map((city) => city.id)).toEqual(["london"]);
  });

  it("keeps each city center inside its bounding box", () => {
    for (const city of CITIES) {
      const [west, south, east, north] = city.bbox;
      expect(city.center.lng).toBeGreaterThan(west);
      expect(city.center.lng).toBeLessThan(east);
      expect(city.center.lat).toBeGreaterThan(south);
      expect(city.center.lat).toBeLessThan(north);
    }
  });

  it("validates country codes", () => {
    expect(isCountryCode("FR")).toBe(true);
    expect(isCountryCode("UK")).toBe(false);
    expect(getCity("lyon")).toBeUndefined();
  });
});
