import { describe, expect, it } from "vitest";
import {
  bedroomsOf,
  openrent,
  parseSearchPage,
  type OpenRentProperty,
  type OpenRentRecord,
} from "@/sources/adapters/openrent";
import type { SourceContext } from "@/sources/types";
import properties from "./fixtures/openrent-properties.json";

const london = { cityId: "london" as const };
const [flat, room] = properties as OpenRentProperty[];

function searchPage(ids: number[]) {
  const lats = ids.map((_, i) => 51.5 + i / 1000);
  const lngs = ids.map((_, i) => -0.12 - i / 1000);
  return `<html><script>
    var NUMBEROFPROPERTIES = ${ids.length};
    var PROPERTYIDS = [ ${ids.join(",")} ];
    var PROPERTYBYID = { };
    var PROPERTYLISTLATITUDES = [ ${lats.join(",")} ];
    var PROPERTYLISTLONGITUDES = [ ${lngs.join(",")} ];
  </script></html>`;
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) items.push(item);
  return items;
}

describe("OpenRent adapter", () => {
  it("normalizes a real listing", () => {
    const record: OpenRentRecord = { ...flat, lat: 51.5175, lng: -0.1335 };
    expect(openrent.normalize(record, london)).toEqual({
      source: "openrent",
      sourceId: "2856638",
      url: "https://www.openrent.co.uk/property-to-rent/london/2-bed-flat-hanway-place-w1t/2856638",
      country: "GB",
      cityId: "london",
      title: "2 Bed Flat, Hanway Place, W1T",
      rent: { amountMinor: 580000, currency: "GBP" },
      chargesIncluded: null,
      areaM2: null,
      bedrooms: 2,
      rooms: null,
      furnished: true,
      location: { lat: 51.5175, lng: -0.1335 },
      locationPrecision: "street",
      address: "Hanway Place, W1T",
      photoUrl:
        "https://imagescdn.openrent.co.uk/listings/2856638/o_1jlp2rmvqoc7aau1p4b69b18nt17.JPG_homepage.JPG",
      publishedAt: null,
    });
  });

  it("skips rooms in shared houses and let-agreed listings", () => {
    expect(openrent.normalize(room, london)).toBeNull();
    expect(openrent.normalize({ ...flat, letAgreed: true }, london)).toBeNull();
  });

  it("reads bedrooms, studios included", () => {
    expect(bedroomsOf(flat)).toBe(2);
    expect(bedroomsOf({ id: 1, title: "1 Bed Flat, London, WC2N", details: ["1 Bed"] })).toBe(1);
    expect(bedroomsOf({ id: 2, title: "Studio Flat, Camden, NW1", details: ["1 Bath"] })).toBe(0);
    expect(bedroomsOf({ id: 3, title: "Flat, Camden, NW1", details: [] })).toBeNull();
  });

  it("reads every id and position from the search page", () => {
    expect(parseSearchPage(searchPage([7, 8]))).toEqual([
      { id: 7, lat: 51.5, lng: -0.12 },
      { id: 8, lat: 51.501, lng: -0.121 },
    ]);
    expect(() => parseSearchPage("<html></html>")).toThrow(/PROPERTYIDS/);
  });

  it("asks for details 20 ids at a time, joins positions on id and filters", async () => {
    const ids = Array.from({ length: 45 }, (_, i) => 100 + i);
    const urls: string[] = [];
    const context: SourceContext = {
      log: () => {},
      fetch: async (url, init) => {
        urls.push(url);
        if (!url.includes("/search/propertiesbyid")) {
          return new Response(searchPage(ids), { headers: { "set-cookie": "session=abc; Path=/" } });
        }
        expect(new Headers(init?.headers).get("cookie")).toBe("session=abc");
        const asked = new URL(url).searchParams.getAll("ids").map(Number);
        // Reversed, as the site does not keep the order; every third one too expensive.
        const answer = asked
          .reverse()
          .map((id) => ({ ...flat, id, rentPerMonth: id % 3 === 0 ? 9000 : 1500 }));
        return Response.json(answer);
      },
    };
    const records = await collect(openrent.search({ ...london, maxRent: 5000 }, context));
    expect(urls).toHaveLength(4);
    expect(new URL(urls[1]).searchParams.getAll("ids")).toHaveLength(20);
    expect(records).toHaveLength(ids.filter((id) => id % 3 !== 0).length);
    const first = records.find((record) => record.id === 101)!;
    expect([first.lat, first.lng]).toEqual([51.501, -0.121]);
  });

  it("links to the site's own pre-filled search page", () => {
    expect(openrent.buildSearchUrl({ cityId: "london", maxRent: 2000, minBedrooms: 1 })).toBe(
      "https://www.openrent.co.uk/properties-to-rent/london?prices_max=2000&bedrooms_min=1",
    );
  });
});
