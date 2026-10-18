import { describe, expect, it } from "vitest";
import {
  monthlyRentMinor,
  parseDisplaySize,
  parseSearchPage,
  rightmove,
  type RightmoveProperty,
} from "@/sources/adapters/rightmove";
import { SearchTruncated, type SourceContext } from "@/sources/types";
import property from "./fixtures/rightmove-property.json";

const london = { cityId: "london" as const };

function page(properties: RightmoveProperty[], resultCount: string) {
  const data = { props: { pageProps: { searchResults: { properties, resultCount } } } };
  return `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></body></html>`;
}

const properties = (n: number, start = 0) =>
  Array.from({ length: n }, (_, i) => ({ ...(property as RightmoveProperty), id: start + i }));

function fakeContext(pages: string[]) {
  const urls: string[] = [];
  const context: SourceContext = {
    log: () => {},
    fetch: async (url) => {
      urls.push(url);
      return new Response(pages.shift() ?? page([], "0"), { headers: { "content-type": "text/html" } });
    },
  };
  return { urls, context };
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) items.push(item);
  return items;
}

describe("Rightmove adapter", () => {
  it("normalizes a real property", () => {
    const listing = rightmove.normalize(property as RightmoveProperty, london);
    expect(listing).toMatchObject({
      source: "rightmove",
      sourceId: "92920959",
      url: "https://www.rightmove.co.uk/properties/92920959",
      country: "GB",
      cityId: "london",
      title: "1 bedroom flat, Winchester Street, South Acton, London, W3",
      rent: { amountMinor: 145000, currency: "GBP" },
      bedrooms: 1,
      rooms: null,
      location: { lat: 51.5056, lng: -0.26806 },
      locationPrecision: "street",
      publishedAt: new Date("2026-09-09T08:30:05Z"),
    });
    expect(listing?.areaM2).toBeCloseTo(29.6, 1);
  });

  it("normalizes weekly rents to monthly and skips unusable records", () => {
    expect(monthlyRentMinor({ amount: 300, frequency: "weekly" })).toBe(130000);
    expect(monthlyRentMinor({ amount: 0, frequency: "monthly" })).toBeNull();
    const base = property as RightmoveProperty;
    expect(rightmove.normalize({ ...base, students: true }, london)).toBeNull();
    expect(rightmove.normalize({ ...base, price: null }, london)).toBeNull();
  });

  it("reads furnished or unfurnished from the summary", () => {
    const base = property as RightmoveProperty;
    expect(rightmove.normalize({ ...base, summary: "Furnished one bedroom flat" }, london)?.furnished).toBe(true);
    expect(rightmove.normalize({ ...base, summary: "Unfurnished. Available now" }, london)?.furnished).toBe(false);
  });

  it("parses sizes in either unit", () => {
    expect(parseDisplaySize("1,076 sq. ft.")).toBeCloseTo(99.96, 1);
    expect(parseDisplaySize("45 sq. m.")).toBe(45);
    expect(parseDisplaySize("")).toBeNull();
  });

  it("reads properties from the page's Next.js payload", () => {
    expect(parseSearchPage(page(properties(2), "4,405")).resultCount).toBe("4,405");
    expect(() => parseSearchPage("<html></html>")).toThrow(/__NEXT_DATA__/);
  });

  it("pages by 24 until the result count", async () => {
    const { urls, context } = fakeContext([page(properties(25), "30"), page(properties(6, 100), "30")]);
    const records = await collect(rightmove.search(london, context));
    expect(records).toHaveLength(31);
    expect(new URL(urls[1]).searchParams.get("index")).toBe("24");
  });

  it("reports a truncated search at Rightmove's page cap", async () => {
    const pages = Array.from({ length: 50 }, () => page(properties(25), "9,999"));
    const { context } = fakeContext(pages);
    await expect(collect(rightmove.search(london, context))).rejects.toBeInstanceOf(SearchTruncated);
  });

  it("links to the site's own pre-filled search page", () => {
    expect(rightmove.buildSearchUrl({ cityId: "london", maxRent: 2000, minBedrooms: 1 })).toBe(
      "https://www.rightmove.co.uk/property-to-rent/find.html?locationIdentifier=REGION%5E87490&maxPrice=2000&minBedrooms=1&sortType=6",
    );
  });
});
