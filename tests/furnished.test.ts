import { describe, expect, it } from "vitest";
import { furnishedFromText } from "@/sources/furnished";

describe("furnishedFromText", () => {
  it("reads English listings", () => {
    expect(furnishedFromText("A fantastic 1 bedroom flat, offered furnished.")).toBe(true);
    expect(furnishedFromText("Two double bedroom flat", "Unfurnished")).toBe(false);
    expect(furnishedFromText("Available furnished or unfurnished")).toBeNull();
    expect(furnishedFromText("Part-furnished garden flat")).toBeNull();
    expect(furnishedFromText("Two double bedroom flat")).toBeNull();
  });

  it("reads French listings", () => {
    expect(furnishedFromText("Appartement meublé 2 pièces")).toBe(true);
    expect(furnishedFromText("Studio MEUBLÉE refait à neuf")).toBe(true);
    expect(furnishedFromText("T3 non meublé, cuisine équipée")).toBe(false);
    expect(furnishedFromText("Appartement non-meublé")).toBe(false);
    expect(furnishedFromText("Location vide, libre de suite")).toBe(false);
  });

  it("doesn't take furniture for a furnished flat", () => {
    expect(furnishedFromText("Cuisine avec meubles hauts et meuble TV")).toBeNull();
  });
});
