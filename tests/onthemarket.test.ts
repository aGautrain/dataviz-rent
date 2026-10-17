import { describe, expect, it } from "vitest";
import {
  monthlyRentMinor,
  onthemarket,
  parseSearchPage,
  type OnTheMarketProperty,
} from "@/sources/adapters/onthemarket";
import type { SourceContext } from "@/sources/types";
import property from "./fixtures/onthemarket-property.json";

const london = { cityId: "london" as const };
const base = property as OnTheMarketProperty;

function page(list: OnTheMarketProperty[], next: boolean) {
  const results = {
    list,
    totalResults: 9170,
    paginationControls: { next: next ? { "next-link": "/to-rent/property/london/?page=2" } : null },
  };
  const data = { props: { pageProps: { initialReduxState: { results } } } };
  // The real tag, as served on 2026-10-17.
  return `<html><body><script id="__NEXT_DATA__" type="application/json" crossorigin="anonymous">${JSON.stringify(data)}</script></body></html>`;
}

const properties = (n: number, start = 0) =>
  Array.from({ length: n }, (_, i) => ({ ...base, id: String(start + i) }));

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) items.push(item);
  return items;
}

describe("OnTheMarket adapter", () => {
  it("normalizes a real property", () => {
    expect(onthemarket.normalize(base, london)).toEqual({
      source: "onthemarket",
      sourceId: "18154013",
      url: "https://www.onthemarket.com/details/18154013/",
      country: "GB",
      cityId: "london",
      title: "2 bedroom flat, Ash Grove, London SE20",
      rent: { amountMinor: 155000, currency: "GBP" },
      chargesIncluded: null,
      areaM2: null,
      bedrooms: 2,
      rooms: null,
      furnished: null,
      location: { lat: 51.406747, lng: -0.056727 },
      locationPrecision: "street",
      address: "Ash Grove, London SE20",
      photoUrl: "https://media.onthemarket.com/properties/18154013/1650607294/image-0-480x320.jpg",
      publishedAt: null,
    });
  });

  it("reads the monthly rent, or converts the weekly one", () => {
    expect(monthlyRentMinor("£2,000 pcm (£462 pw)")).toBe(200000);
    expect(monthlyRentMinor("£300 pw")).toBe(130000);
    expect(monthlyRentMinor("POA")).toBeNull();
    expect(monthlyRentMinor(undefined)).toBeNull();
  });

  it("skips adverts and listings without a price", () => {
    const ad = { id: "x", "ad?": true, title: "Moving soon?" } as OnTheMarketProperty;
    expect(onthemarket.normalize(ad, london)).toBeNull();
    expect(onthemarket.normalize({ ...base, price: "POA" }, london)).toBeNull();
  });

  it("reads results from the page's Next.js payload", () => {
    expect(parseSearchPage(page(properties(2), true)).list).toHaveLength(2);
    expect(() => parseSearchPage("<html></html>")).toThrow(/__NEXT_DATA__/);
  });

  it("follows pages until there is no next one", async () => {
    const pages = [page(properties(30), true), page(properties(5, 100), false)];
    const urls: string[] = [];
    const context: SourceContext = {
      log: () => {},
      fetch: async (url) => {
        urls.push(url);
        return new Response(pages.shift() ?? page([], false));
      },
    };
    expect(await collect(onthemarket.search({ ...london, maxRent: 5000 }, context))).toHaveLength(35);
    expect(urls).toHaveLength(2);
    expect(new URL(urls[1]).searchParams.get("page")).toBe("2");
  });

  it("links to the site's own pre-filled search page", () => {
    expect(onthemarket.buildSearchUrl({ cityId: "london", maxRent: 2000, minBedrooms: 1 })).toBe(
      "https://www.onthemarket.com/to-rent/property/london/?max-price=2000&min-bedrooms=1&sort-field=update_date",
    );
  });
});
