import { describe, expect, it } from "vitest";
import { bienici, buildApiFilters, type BieniciAd } from "@/sources/adapters/bienici";
import type { SourceContext } from "@/sources/types";
import { SearchTruncated } from "@/sources/types";
import ad from "./fixtures/bienici-ad.json";

const rennes = { cityId: "rennes" as const };

function fakeContext(pages: { total: number; ads: BieniciAd[] }[]) {
  const urls: string[] = [];
  const context: SourceContext = {
    log: () => {},
    fetch: async (url) => {
      urls.push(url);
      const page = pages.shift() ?? { total: 0, ads: [] };
      return Response.json({ total: page.total, from: 0, perPage: 24, realEstateAds: page.ads });
    },
  };
  return { urls, context };
}

const ads = (n: number, prefix = "ad") =>
  Array.from({ length: n }, (_, i) => ({ ...(ad as BieniciAd), id: `${prefix}-${i}` }));

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) items.push(item);
  return items;
}

describe("Bien'ici adapter", () => {
  it("normalizes a real ad", () => {
    expect(bienici.normalize(ad as BieniciAd, rennes)).toEqual({
      source: "bienici",
      sourceId: "ics-lec_LECOMTE_loc-GES03100041-610",
      url: "https://www.bienici.com/annonce/location/rennes/appartement/2pieces/ics-lec_LECOMTE_loc-GES03100041-610",
      country: "FR",
      cityId: "rennes",
      title: "Appartement 2 pièces 46 m² – Francisco Ferrer",
      rent: { amountMinor: 84200, currency: "EUR" },
      chargesIncluded: true,
      areaM2: 46.4,
      bedrooms: 1,
      rooms: 2,
      furnished: true,
      location: { lat: 48.1015, lng: -1.6589 },
      locationPrecision: "street",
      address: "Francisco Ferrer, 35000, Rennes",
      photoUrl: expect.stringMatching(/^https:\/\/file\.bienici\.com\/photo\//),
      publishedAt: new Date("2026-10-16T23:03:10.302Z"),
    });
  });

  it("skips records that are not usable rentals", () => {
    expect(bienici.normalize({ ...(ad as BieniciAd), adType: "buy" }, rennes)).toBeNull();
    expect(bienici.normalize({ ...(ad as BieniciAd), price: null }, rennes)).toBeNull();
    expect(bienici.normalize({ ...(ad as BieniciAd), propertyType: "parking" }, rennes)).toBeNull();
  });

  it("translates criteria into API filters", () => {
    expect(
      buildApiFilters({ cityId: "paris", maxRent: 1500, minBedrooms: 1, minAreaM2: 30, furnished: true }, 3),
    ).toMatchObject({
      size: 24,
      from: 48,
      page: 3,
      filterType: "rent",
      zoneIdsByTypes: { zoneIds: ["-7444"] },
      maxPrice: 1500,
      minBedrooms: 1,
      minArea: 30,
      isFurnished: true,
    });
  });

  it("pages until the last result", async () => {
    const { urls, context } = fakeContext([
      { total: 30, ads: ads(24) },
      { total: 30, ads: ads(6, "p2") },
    ]);
    const records = await collect(bienici.search(rennes, context));
    expect(records).toHaveLength(30);
    expect(urls).toHaveLength(2);
    expect(JSON.parse(new URL(urls[1]).searchParams.get("filters") ?? "{}")).toMatchObject({ from: 24 });
  });

  it("reports a truncated search when the API cap is reached", async () => {
    const pages = Array.from({ length: 105 }, () => ({ total: 5000, ads: ads(24) }));
    const { context } = fakeContext(pages);
    await expect(collect(bienici.search(rennes, context))).rejects.toBeInstanceOf(SearchTruncated);
  });

  it("links to the site's own pre-filled search page", () => {
    expect(
      bienici.buildSearchUrl({ cityId: "rennes", maxRent: 900, minBedrooms: 1, minAreaM2: 35, furnished: true }),
    ).toBe(
      "https://www.bienici.com/recherche/location/rennes-35000?prix-max=900&chambres-min=1&surface-min=35&meuble=oui",
    );
    expect(bienici.buildSearchUrl({ cityId: "paris" })).toBe(
      "https://www.bienici.com/recherche/location/paris-75000",
    );
  });
});
