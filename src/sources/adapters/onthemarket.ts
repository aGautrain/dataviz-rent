import type { CityId } from "@/domain/countries";
import type { Listing } from "@/domain/listing";
import type { SearchCriteria } from "@/domain/search";
import { weeklyToMonthly } from "@/domain/units";
import { expectOk } from "../http";
import type { SourceAdapter } from "../types";

/** The fields we read from a result in an OnTheMarket search page. */
export interface OnTheMarketProperty {
  id: string;
  /** Missing on adverts mixed into the results. */
  "details-url"?: string;
  "ad?"?: boolean;
  "property-title"?: string;
  address?: string;
  /** e.g. "£1,550 pcm (£358 pw)" or "£450 pw". */
  price?: string;
  bedrooms?: number | null;
  location?: { lat: number; lon: number } | null;
  images?: { default?: string }[];
  "cover-image"?: { default?: string } | null;
}

interface SearchResults {
  list?: OnTheMarketProperty[];
  totalResults?: number;
  paginationControls?: { next?: { "next-link"?: string } | null };
}

const SLUGS: Partial<Record<CityId, string>> = {
  london: "london",
};

const BASE_URL = "https://www.onthemarket.com";

function slugOf(cityId: CityId): string {
  const slug = SLUGS[cityId];
  if (!slug) throw new Error(`OnTheMarket does not cover ${cityId}`);
  return slug;
}

export function buildSearchParams(criteria: SearchCriteria, page?: number): URLSearchParams {
  const params = new URLSearchParams();
  if (criteria.minRent !== undefined) params.set("min-price", String(criteria.minRent));
  if (criteria.maxRent !== undefined) params.set("max-price", String(criteria.maxRent));
  if (criteria.minBedrooms !== undefined) params.set("min-bedrooms", String(criteria.minBedrooms));
  if (criteria.maxBedrooms !== undefined) params.set("max-bedrooms", String(criteria.maxBedrooms));
  if (page !== undefined && page > 1) params.set("page", String(page));
  // Most recently updated first, so a capped run still covers the newest listings.
  params.set("sort-field", "update_date");
  return params;
}

function searchUrl(criteria: SearchCriteria, page?: number): string {
  return `${BASE_URL}/to-rent/property/${slugOf(criteria.cityId)}/?${buildSearchParams(criteria, page)}`;
}

/** Search data lives in the page's Next.js payload (its Redux state). */
export function parseSearchPage(html: string): SearchResults {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) throw new Error("OnTheMarket page has no __NEXT_DATA__ payload");
  const data = JSON.parse(match[1]) as {
    props?: { pageProps?: { initialReduxState?: { results?: SearchResults } } };
  };
  const results = data.props?.pageProps?.initialReduxState?.results;
  if (!results) throw new Error("OnTheMarket payload has no results");
  return results;
}

/** Monthly rent in pence from the displayed price: the pcm figure, else the weekly one. */
export function monthlyRentMinor(price: string | undefined): number | null {
  const amount = (unit: string) => {
    const match = price?.match(new RegExp(`£([\\d,]+(?:\\.\\d+)?)\\s*${unit}\\b`, "i"));
    const value = match ? Number(match[1].replace(/,/g, "")) : NaN;
    return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : null;
  };
  const monthly = amount("pcm");
  if (monthly !== null) return monthly;
  const weekly = amount("pw");
  return weekly === null ? null : weeklyToMonthly(weekly);
}

export const onthemarket: SourceAdapter<OnTheMarketProperty> = {
  id: "onthemarket",
  name: "OnTheMarket",
  cities: ["london"],

  async *search(criteria, { fetch }) {
    for (let page = 1; ; page++) {
      const response = await expectOk(await fetch(searchUrl(criteria, page)), "OnTheMarket search");
      const results = parseSearchPage(await response.text());
      const list = results.list ?? [];
      yield* list;
      if (list.length === 0 || !results.paginationControls?.next?.["next-link"]) return;
    }
  },

  normalize(property, criteria) {
    if (property["ad?"] || !property["details-url"]) return null;
    const rentMinor = monthlyRentMinor(property.price);
    if (rentMinor === null) return null;

    const location = property.location;
    const kind = property["property-title"]?.replace(/\s+to rent$/i, "");
    const listing: Listing = {
      source: "onthemarket",
      sourceId: property.id,
      url: new URL(property["details-url"], BASE_URL).toString(),
      country: "GB",
      cityId: criteria.cityId,
      title: [kind, property.address].filter(Boolean).join(", "),
      rent: { amountMinor: rentMinor, currency: "GBP" },
      chargesIncluded: null,
      areaM2: null,
      bedrooms: property.bedrooms ?? null,
      rooms: null,
      furnished: null,
      location: location ? { lat: location.lat, lng: location.lon } : null,
      locationPrecision: location ? "street" : null,
      address: property.address ?? null,
      photoUrl: property.images?.[0]?.default ?? property["cover-image"]?.default ?? null,
      publishedAt: null,
    };
    return listing;
  },

  buildSearchUrl(criteria) {
    return searchUrl(criteria);
  },
};
