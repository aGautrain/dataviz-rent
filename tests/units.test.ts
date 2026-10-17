import { describe, expect, it } from "vitest";
import {
  formatArea,
  formatMoney,
  fromSquareMeters,
  money,
  toSquareMeters,
  weeklyToMonthly,
} from "@/domain/units";

describe("units", () => {
  it("converts square feet to square meters and back", () => {
    expect(toSquareMeters(1000, "sqft")).toBeCloseTo(92.9, 1);
    expect(toSquareMeters(45, "m2")).toBe(45);
    expect(fromSquareMeters(toSquareMeters(750, "sqft"), "sqft")).toBeCloseTo(750, 6);
  });

  it("stores money in minor units", () => {
    expect(money(1250.5, "EUR")).toEqual({ amountMinor: 125050, currency: "EUR" });
  });

  it("converts weekly rent to monthly", () => {
    // £300 per week is £1,300 per calendar month.
    expect(weeklyToMonthly(30000)).toBe(130000);
  });

  it("formats in the market's conventions", () => {
    expect(formatMoney(money(1300, "GBP"), "en-GB")).toBe("£1,300");
    expect(formatMoney(money(1250, "EUR"), "fr-FR")).toMatch(/1\s?250\s?€/);
    expect(formatArea(50, "sqft", "en-GB")).toBe("538 sq ft");
    expect(formatArea(50, "m2", "fr-FR")).toBe("50 m²");
  });
});
