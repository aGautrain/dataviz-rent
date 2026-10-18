import type { CityId } from "@/domain/countries";
import type { Listing } from "@/domain/listing";
import type { SearchCriteria } from "@/domain/search";
import { toSquareMeters, weeklyToMonthly } from "@/domain/units";
import { furnishedFromText } from "../furnished";
import { expectOk } from "../http";
import { SearchTruncated, type SourceAdapter } from "../types";

/** The fields we read from a property in a Rightmove search page. */
export interface RightmoveProperty {
  id: number;
  bedrooms?: number | null;
  displayAddress?: string;
  location?: { latitude: number; longitude: number } | null;
  price?: { amount?: number; frequency?: string; currencyCode?: string } | null;
  displaySize?: string | null;
  propertyTypeFullDescription?: string;
  /** The first lines of the agent's description. */
  summary?: string;
  propertySubType?: string | null;
  propertyImages?: { mainImageSrc?: string } | null;
  firstVisibleDate?: string | null;
  transactionType?: string;
  commercial?: boolean;
  students?: boolean;
}

interface SearchResults {
  properties?: RightmoveProperty[];
  resultCount?: string;
  pagination?: { total?: number; options?: { value: string }[] };
}

const LOCATIONS: Partial<Record<CityId, string>> = {
  london: "REGION^87490",
};

const BASE_URL = "https://www.rightmove.co.uk";
/** Rightmove pages by 24 and serves at most 42 pages for one search. */
const PAGE_STEP = 24;
const MAX_INDEX = 1000;

function locationOf(cityId: CityId): string {
  const location = LOCATIONS[cityId];
  if (!location) throw new Error(`Rightmove does not cover ${cityId}`);
  return location;
}

export function buildSearchParams(criteria: SearchCriteria, index?: number): URLSearchParams {
  const params = new URLSearchParams({ locationIdentifier: locationOf(criteria.cityId) });
  if (criteria.minRent !== undefined) params.set("minPrice", String(criteria.minRent));
  if (criteria.maxRent !== undefined) params.set("maxPrice", String(criteria.maxRent));
  if (criteria.minBedrooms !== undefined) params.set("minBedrooms", String(criteria.minBedrooms));
  if (criteria.maxBedrooms !== undefined) params.set("maxBedrooms", String(criteria.maxBedrooms));
  if (criteria.furnished !== undefined) {
    params.set("furnishTypes", criteria.furnished ? "furnished" : "unfurnished");
  }
  // Newest first, so a capped run still covers the most recent listings.
  params.set("sortType", "6");
  if (index !== undefined) params.set("index", String(index));
  return params;
}

/** Search data lives in the page's Next.js payload. */
export function parseSearchPage(html: string): SearchResults {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) throw new Error("Rightmove page has no __NEXT_DATA__ payload");
  const data = JSON.parse(match[1]) as {
    props?: { pageProps?: { searchResults?: SearchResults } };
  };
  const results = data.props?.pageProps?.searchResults;
  if (!results) throw new Error("Rightmove payload has no searchResults");
  return results;
}

/** "319 sq. ft." or "45 sq. m." → square meters. */
export function parseDisplaySize(size: string | null | undefined): number | null {
  const match = size?.replace(/,/g, "").match(/([\d.]+)\s*sq\.?\s*(ft|m)/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  return match[2].toLowerCase() === "ft" ? toSquareMeters(value, "sqft") : value;
}

const MONTHS_PER_YEAR = 12;

/** Monthly rent in pence, whatever frequency the listing quotes. */
export function monthlyRentMinor(price: RightmoveProperty["price"]): number | null {
  const amount = price?.amount;
  if (!amount || amount <= 0) return null;
  const minor = Math.round(amount * 100);
  switch (price?.frequency) {
    case "monthly":
      return minor;
    case "weekly":
      return weeklyToMonthly(minor);
    case "yearly":
      return Math.round(minor / MONTHS_PER_YEAR);
    case "quarterly":
      return Math.round(minor / 3);
    case "daily":
      return Math.round((minor * 365) / MONTHS_PER_YEAR);
    default:
      return null;
  }
}

export const rightmove: SourceAdapter<RightmoveProperty> = {
  id: "rightmove",
  name: "Rightmove",
  cities: ["london"],

  async *search(criteria, { fetch }) {
    for (let index = 0; ; index += PAGE_STEP) {
      const url = `${BASE_URL}/property-to-rent/find.html?${buildSearchParams(criteria, index)}`;
      const response = await expectOk(await fetch(url), "Rightmove search");
      const results = parseSearchPage(await response.text());
      const properties = results.properties ?? [];
      yield* properties;

      const total = Number((results.resultCount ?? "0").replace(/,/g, ""));
      const next = index + PAGE_STEP;
      if (properties.length === 0 || next >= total) return;
      if (next >= MAX_INDEX) {
        throw new SearchTruncated(`Rightmove stops at ${MAX_INDEX} of ${total} results`);
      }
    }
  },

  normalize(property, criteria) {
    if (property.transactionType && property.transactionType !== "rent") return null;
    if (property.commercial || property.students) return null;
    const rentMinor = monthlyRentMinor(property.price);
    if (rentMinor === null) return null;

    const location = property.location;
    const listing: Listing = {
      source: "rightmove",
      sourceId: String(property.id),
      url: `${BASE_URL}/properties/${property.id}`,
      country: "GB",
      cityId: criteria.cityId,
      title: [property.propertyTypeFullDescription, property.displayAddress].filter(Boolean).join(", "),
      rent: { amountMinor: rentMinor, currency: "GBP" },
      chargesIncluded: null,
      areaM2: parseDisplaySize(property.displaySize),
      bedrooms: property.bedrooms ?? null,
      rooms: null,
      furnished: furnishedFromText(property.summary, property.propertyTypeFullDescription),
      location: location ? { lat: location.latitude, lng: location.longitude } : null,
      locationPrecision: location ? "street" : null,
      address: property.displayAddress ?? null,
      photoUrl: property.propertyImages?.mainImageSrc ?? null,
      publishedAt: property.firstVisibleDate ? new Date(property.firstVisibleDate) : null,
    };
    return listing;
  },

  buildSearchUrl(criteria) {
    return `${BASE_URL}/property-to-rent/find.html?${buildSearchParams(criteria)}`;
  },
};
