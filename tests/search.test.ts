import { describe, expect, it } from "vitest";
import { isCityId } from "@/domain/countries";
import { parseCriteria } from "@/domain/search";

describe("parseCriteria", () => {
  it("reads every filter from the query", () => {
    expect(
      parseCriteria(
        {
          city: "london",
          minRent: "1000",
          maxRent: "2500",
          minBedrooms: "1",
          maxBedrooms: "3",
          minArea: "35,5",
          maxArea: "90",
          furnished: "yes",
        },
        isCityId,
      ),
    ).toEqual({
      cityId: "london",
      minRent: 1000,
      maxRent: 2500,
      minBedrooms: 1,
      maxBedrooms: 3,
      minAreaM2: 35.5,
      maxAreaM2: 90,
      furnished: true,
    });
  });

  it("defaults to Paris and ignores empty or invalid values", () => {
    expect(
      parseCriteria({ city: "berlin", minRent: "", maxRent: "abc", minArea: "-5", furnished: "maybe" }, isCityId),
    ).toEqual({ cityId: "paris" });
  });

  it("takes the first value of a repeated parameter", () => {
    expect(parseCriteria({ city: ["rennes", "london"], furnished: "no" }, isCityId)).toMatchObject({
      cityId: "rennes",
      furnished: false,
    });
  });
});
