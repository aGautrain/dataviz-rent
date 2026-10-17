import type { CityId } from "@/domain/countries";
import type { Listing } from "@/domain/listing";
import type { SearchCriteria } from "@/domain/search";
import { expectOk } from "../http";
import { SearchTruncated, type SourceAdapter } from "../types";

/** The fields we read from a record of bienici.com's realEstateAds.json. */
export interface BieniciAd {
  id: string;
  adType?: string;
  propertyType?: string;
  title?: string;
  city?: string;
  postalCode?: string;
  price?: number | number[] | null;
  charges?: number | null;
  surfaceArea?: number | null;
  roomsQuantity?: number | null;
  bedroomsQuantity?: number | null;
  isFurnished?: boolean | null;
  publicationDate?: string | null;
  photos?: { url?: string; url_photo?: string }[];
  district?: { libelle?: string } | null;
  blurInfo?: {
    type?: string;
    radius?: number;
    position?: { lat: number; lon: number };
    centroid?: { lat: number; lon: number };
  } | null;
}

interface BieniciCity {
  /** Zone ids from res.bienici.com/suggest.json. */
  zoneIds: string[];
  /** Slug used in search page URLs. */
  searchSlug: string;
  /** Slug used in ad page URLs. */
  adSlug: string;
}

const CITIES: Partial<Record<CityId, BieniciCity>> = {
  paris: { zoneIds: ["-7444"], searchSlug: "paris-75000", adSlug: "paris" },
  rennes: { zoneIds: ["-54517"], searchSlug: "rennes-35000", adSlug: "rennes" },
};

const API_URL = "https://www.bienici.com/realEstateAds.json";
const PAGE_SIZE = 24;
/** The API stops answering beyond this many results for one query. */
const MAX_RESULTS = 2500;

function cityConfig(cityId: CityId): BieniciCity {
  const config = CITIES[cityId];
  if (!config) throw new Error(`Bien'ici does not cover ${cityId}`);
  return config;
}

export function buildApiFilters(criteria: SearchCriteria, page: number) {
  const filters: Record<string, unknown> = {
    size: PAGE_SIZE,
    from: (page - 1) * PAGE_SIZE,
    page,
    filterType: "rent",
    propertyType: ["flat", "house"],
    onTheMarket: [true],
    zoneIdsByTypes: { zoneIds: cityConfig(criteria.cityId).zoneIds },
    sortBy: "publicationDate",
    sortOrder: "desc",
  };
  if (criteria.minRent !== undefined) filters.minPrice = criteria.minRent;
  if (criteria.maxRent !== undefined) filters.maxPrice = criteria.maxRent;
  if (criteria.minBedrooms !== undefined) filters.minBedrooms = criteria.minBedrooms;
  if (criteria.maxBedrooms !== undefined) filters.maxBedrooms = criteria.maxBedrooms;
  if (criteria.minAreaM2 !== undefined) filters.minArea = criteria.minAreaM2;
  if (criteria.maxAreaM2 !== undefined) filters.maxArea = criteria.maxAreaM2;
  if (criteria.furnished === true) filters.isFurnished = true;
  if (criteria.furnished === false) filters.isNotFurnished = true;
  return filters;
}

const PROPERTY_LABELS: Record<string, { label: string; slug: string }> = {
  flat: { label: "Appartement", slug: "appartement" },
  house: { label: "Maison", slug: "maison" },
};

function firstPrice(price: BieniciAd["price"]): number | null {
  const value = Array.isArray(price) ? price[0] : price;
  return typeof value === "number" && value > 0 ? value : null;
}

export const bienici: SourceAdapter<BieniciAd> = {
  id: "bienici",
  name: "Bien'ici",
  cities: ["paris", "rennes"],

  async *search(criteria, { fetch }) {
    for (let page = 1; ; page++) {
      const filters = buildApiFilters(criteria, page);
      const url = `${API_URL}?filters=${encodeURIComponent(JSON.stringify(filters))}`;
      const response = await expectOk(
        await fetch(url, { headers: { accept: "application/json" } }),
        "Bien'ici search",
      );
      const body = (await response.json()) as { total?: number; realEstateAds?: BieniciAd[] };
      const ads = body.realEstateAds ?? [];
      yield* ads;

      const total = body.total ?? 0;
      const seen = page * PAGE_SIZE;
      if (ads.length < PAGE_SIZE || seen >= total) return;
      if (seen >= MAX_RESULTS) {
        throw new SearchTruncated(`Bien'ici stops at ${MAX_RESULTS} of ${total} results`);
      }
    }
  },

  normalize(ad, criteria) {
    const rent = firstPrice(ad.price);
    if (ad.adType !== "rent" || rent === null) return null;
    const property = PROPERTY_LABELS[ad.propertyType ?? ""];
    if (!property) return null;

    const position = ad.blurInfo?.position ?? ad.blurInfo?.centroid ?? null;
    const radius = ad.blurInfo?.radius ?? Infinity;
    const rooms = ad.roomsQuantity ?? null;
    const area = ad.surfaceArea ?? null;
    const place = ad.district?.libelle || ad.city || "";
    const generatedTitle = [
      property.label,
      rooms ? `${rooms} pièce${rooms > 1 ? "s" : ""}` : null,
      area ? `${Math.round(area)} m²` : null,
    ]
      .filter(Boolean)
      .join(" ");

    const listing: Listing = {
      source: "bienici",
      sourceId: ad.id,
      url: `https://www.bienici.com/annonce/location/${cityConfig(criteria.cityId).adSlug}/${property.slug}/${rooms ?? 1}pieces/${ad.id}`,
      country: "FR",
      cityId: criteria.cityId,
      title: ad.title?.trim() || (place ? `${generatedTitle} – ${place}` : generatedTitle),
      rent: { amountMinor: Math.round(rent * 100), currency: "EUR" },
      // Bien'ici prices rentals charges included and lists the charges apart.
      chargesIncluded: true,
      areaM2: area,
      bedrooms: ad.bedroomsQuantity ?? null,
      rooms,
      furnished: ad.isFurnished ?? null,
      location: position ? { lat: position.lat, lng: position.lon } : null,
      // Positions are blurred into a disk; a small one still places the street.
      locationPrecision: position ? (radius <= 150 ? "street" : "area") : null,
      address: [ad.district?.libelle, ad.postalCode, ad.city].filter(Boolean).join(", ") || null,
      photoUrl: ad.photos?.[0]?.url ?? null,
      publishedAt: ad.publicationDate ? new Date(ad.publicationDate) : null,
    };
    return listing;
  },

  buildSearchUrl(criteria) {
    const { searchSlug } = cityConfig(criteria.cityId);
    const params = new URLSearchParams();
    if (criteria.minRent !== undefined) params.set("prix-min", String(criteria.minRent));
    if (criteria.maxRent !== undefined) params.set("prix-max", String(criteria.maxRent));
    if (criteria.minBedrooms !== undefined) params.set("chambres-min", String(criteria.minBedrooms));
    if (criteria.maxBedrooms !== undefined) params.set("chambres-max", String(criteria.maxBedrooms));
    if (criteria.minAreaM2 !== undefined) params.set("surface-min", String(criteria.minAreaM2));
    if (criteria.maxAreaM2 !== undefined) params.set("surface-max", String(criteria.maxAreaM2));
    if (criteria.furnished === true) params.set("meuble", "oui");
    if (criteria.furnished === false) params.set("non-meuble", "oui");
    const query = params.toString();
    return `https://www.bienici.com/recherche/location/${searchSlug}${query ? `?${query}` : ""}`;
  },
};
