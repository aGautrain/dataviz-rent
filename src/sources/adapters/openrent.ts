import type { CityId } from "@/domain/countries";
import type { Listing } from "@/domain/listing";
import type { SearchCriteria } from "@/domain/search";
import { expectOk } from "../http";
import type { SourceAdapter } from "../types";

/** A listing as OpenRent's /search/propertiesbyid returns it. */
export interface OpenRentProperty {
  id: number;
  title?: string;
  letAgreed?: boolean;
  isMultiRoom?: boolean;
  /** e.g. ["2 Beds", "2 Baths", "Furnished"]; no "Bed" entry for studios. */
  details?: string[];
  rentPerMonth?: number;
  /** Protocol-relative. */
  imageUrl?: string | null;
}

/** The API result plus the position the search page gives for that id. */
export type OpenRentRecord = OpenRentProperty & { lat?: number; lng?: number };

const SLUGS: Partial<Record<CityId, string>> = {
  london: "london",
};

const BASE_URL = "https://www.openrent.co.uk";
/** What the site's own pages ask for at once. */
const IDS_PER_REQUEST = 20;

function slugOf(cityId: CityId): string {
  const slug = SLUGS[cityId];
  if (!slug) throw new Error(`OpenRent does not cover ${cityId}`);
  return slug;
}

/**
 * The search page's own filter parameters. OpenRent ignores them server-side
 * (it filters in the browser), but they pre-fill the page for alert links.
 */
export function buildSearchParams(criteria: SearchCriteria): URLSearchParams {
  const params = new URLSearchParams();
  if (criteria.minRent !== undefined) params.set("prices_min", String(criteria.minRent));
  if (criteria.maxRent !== undefined) params.set("prices_max", String(criteria.maxRent));
  if (criteria.minBedrooms !== undefined) params.set("bedrooms_min", String(criteria.minBedrooms));
  if (criteria.maxBedrooms !== undefined) params.set("bedrooms_max", String(criteria.maxBedrooms));
  return params;
}

function searchUrl(criteria: SearchCriteria): string {
  const query = buildSearchParams(criteria).toString();
  return `${BASE_URL}/properties-to-rent/${slugOf(criteria.cityId)}${query ? `?${query}` : ""}`;
}

function numberArray(html: string, name: string): number[] {
  const match = html.match(new RegExp(`\\b${name}\\s*=\\s*\\[([^\\]]*)\\]`));
  if (!match) throw new Error(`OpenRent page has no ${name}`);
  return match[1]
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value));
}

/**
 * Every listing of the search, nearest to the centre first: the page carries
 * all their ids and positions in inline scripts, but details for only 20.
 */
export function parseSearchPage(html: string): { id: number; lat: number; lng: number }[] {
  const ids = numberArray(html, "PROPERTYIDS");
  const lats = numberArray(html, "PROPERTYLISTLATITUDES");
  const lngs = numberArray(html, "PROPERTYLISTLONGITUDES");
  if (lats.length !== ids.length || lngs.length !== ids.length) {
    throw new Error("OpenRent page has ids and positions of different lengths");
  }
  return ids.map((id, index) => ({ id, lat: lats[index], lng: lngs[index] }));
}

/** 2 from "2 Beds", 0 for a studio, null when the listing does not say. */
export function bedroomsOf(property: OpenRentProperty): number | null {
  for (const detail of property.details ?? []) {
    const match = detail.match(/^(\d+)\s+Beds?$/i);
    if (match) return Number(match[1]);
  }
  return /\bstudio\b/i.test(property.title ?? "") ? 0 : null;
}

function furnishedOf(property: OpenRentProperty): boolean | null {
  const details = (property.details ?? []).map((detail) => detail.toLowerCase());
  if (details.includes("unfurnished")) return false;
  if (details.includes("furnished")) return true;
  return null;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function matches(property: OpenRentProperty, criteria: SearchCriteria): boolean {
  const rent = property.rentPerMonth;
  if (rent === undefined) return false;
  if (criteria.minRent !== undefined && rent < criteria.minRent) return false;
  if (criteria.maxRent !== undefined && rent > criteria.maxRent) return false;
  const bedrooms = bedroomsOf(property);
  if (bedrooms !== null) {
    if (criteria.minBedrooms !== undefined && bedrooms < criteria.minBedrooms) return false;
    if (criteria.maxBedrooms !== undefined && bedrooms > criteria.maxBedrooms) return false;
  }
  return true;
}

export const openrent: SourceAdapter<OpenRentRecord> = {
  id: "openrent",
  name: "OpenRent",
  cities: ["london"],

  async *search(criteria, { fetch }) {
    const pageUrl = searchUrl({ cityId: criteria.cityId });
    const page = await expectOk(await fetch(pageUrl), "OpenRent search");
    // The site's own calls carry the page's cookies.
    const cookie = page.headers
      .getSetCookie()
      .map((header) => header.split(";")[0])
      .join("; ");
    const positions = parseSearchPage(await page.text());

    for (let start = 0; start < positions.length; start += IDS_PER_REQUEST) {
      const batch = positions.slice(start, start + IDS_PER_REQUEST);
      const query = new URLSearchParams(batch.map(({ id }) => ["ids", String(id)]));
      const response = await expectOk(
        await fetch(`${BASE_URL}/search/propertiesbyid?${query}`, {
          headers: {
            accept: "application/json",
            "x-requested-with": "XMLHttpRequest",
            referer: pageUrl,
            ...(cookie ? { cookie } : {}),
          },
        }),
        "OpenRent listings",
      );
      const properties = (await response.json()) as OpenRentProperty[];
      // Not returned in the order asked: join on the id.
      const positionById = new Map(batch.map((position) => [position.id, position]));
      for (const property of properties) {
        if (!matches(property, criteria)) continue;
        const position = positionById.get(property.id);
        yield { ...property, lat: position?.lat, lng: position?.lng };
      }
    }
  },

  normalize(property, criteria) {
    if (property.letAgreed || property.isMultiRoom) return null;
    const title = property.title?.trim() ?? "";
    if (/^room\b/i.test(title)) return null;
    const rent = property.rentPerMonth;
    if (!rent || rent <= 0) return null;

    const hasPosition = property.lat !== undefined && property.lng !== undefined;
    const address = title.split(",").slice(1).join(",").trim();
    const slug = slugify(title) || "property";
    const listing: Listing = {
      source: "openrent",
      sourceId: String(property.id),
      url: `${BASE_URL}/property-to-rent/${slugOf(criteria.cityId)}/${slug}/${property.id}`,
      country: "GB",
      cityId: criteria.cityId,
      title,
      rent: { amountMinor: Math.round(rent * 100), currency: "GBP" },
      chargesIncluded: null,
      areaM2: null,
      bedrooms: bedroomsOf(property),
      rooms: null,
      furnished: furnishedOf(property),
      location: hasPosition ? { lat: property.lat!, lng: property.lng! } : null,
      locationPrecision: hasPosition ? "street" : null,
      address: address || null,
      photoUrl: property.imageUrl
        ? property.imageUrl.startsWith("//")
          ? `https:${property.imageUrl}`
          : property.imageUrl
        : null,
      publishedAt: null,
    };
    return listing;
  },

  buildSearchUrl(criteria) {
    return searchUrl(criteria);
  },
};
