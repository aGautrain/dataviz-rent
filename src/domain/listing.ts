import type { CityId, CountryCode, LatLng, RoomConvention } from "./countries";
import type { Money } from "./units";

/**
 * A rental listing in the app's common format, whatever site it came from.
 * Source adapters produce this shape; nothing downstream reads raw site data.
 */
export interface Listing {
  /** Identifier of the source adapter, e.g. "bienici", "rightmove". */
  source: string;
  /** The listing's identifier on the source site. */
  sourceId: string;
  url: string;
  country: CountryCode;
  cityId: CityId;
  title: string;
  /** Monthly rent. */
  rent: Money;
  chargesIncluded: boolean | null;
  /** Living area, always in square meters whatever the market's unit. */
  areaM2: number | null;
  /** UK-style bedroom count (0 = studio). */
  bedrooms: number | null;
  /** French-style "pièces" count. */
  rooms: number | null;
  furnished: boolean | null;
  location: LatLng | null;
  /** How precise `location` is: an exact address, a street, or only a district. */
  locationPrecision: "exact" | "street" | "area" | null;
  address: string | null;
  photoUrl: string | null;
  publishedAt: Date | null;
}

/**
 * Bedrooms are the one size measure comparable across markets, so search
 * filters use them. French listings mostly give "pièces": a T3 is usually a
 * living room plus two bedrooms.
 */
export function effectiveBedrooms(
  listing: Pick<Listing, "bedrooms" | "rooms">,
): number | null {
  if (listing.bedrooms !== null) return listing.bedrooms;
  if (listing.rooms !== null) return Math.max(0, listing.rooms - 1);
  return null;
}

export function sizeLabel(
  listing: Pick<Listing, "bedrooms" | "rooms">,
  convention: RoomConvention,
): string | null {
  if (convention === "rooms" && listing.rooms !== null) {
    return listing.rooms === 1 ? "Studio" : `T${listing.rooms}`;
  }
  const bedrooms = effectiveBedrooms(listing);
  if (bedrooms === null) return null;
  if (bedrooms === 0) return "Studio";
  return `${bedrooms} chambre${bedrooms > 1 ? "s" : ""}`;
}
