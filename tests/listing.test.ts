import { describe, expect, it } from "vitest";
import { effectiveBedrooms, sizeLabel } from "@/domain/listing";

describe("listing size", () => {
  it("prefers the bedroom count when the source gives it", () => {
    expect(effectiveBedrooms({ bedrooms: 2, rooms: 4 })).toBe(2);
  });

  it("derives bedrooms from French pièces", () => {
    expect(effectiveBedrooms({ bedrooms: null, rooms: 3 })).toBe(2);
    expect(effectiveBedrooms({ bedrooms: null, rooms: 1 })).toBe(0);
    expect(effectiveBedrooms({ bedrooms: null, rooms: null })).toBeNull();
  });

  it("labels sizes in each market's convention", () => {
    expect(sizeLabel({ bedrooms: null, rooms: 3 }, "rooms")).toBe("T3");
    expect(sizeLabel({ bedrooms: null, rooms: 1 }, "rooms")).toBe("Studio");
    expect(sizeLabel({ bedrooms: 2, rooms: null }, "bedrooms")).toBe("2 chambres");
    expect(sizeLabel({ bedrooms: 0, rooms: null }, "bedrooms")).toBe("Studio");
  });
});
