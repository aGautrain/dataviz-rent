import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import type { CityId } from "@/domain/countries";
import type { Listing } from "@/domain/listing";
import type { Database } from "./client";
import { listings, type ListingRow, type NewListingRow } from "./schema";

export function toRow(listing: Listing): NewListingRow {
  return {
    source: listing.source,
    sourceId: listing.sourceId,
    url: listing.url,
    country: listing.country,
    cityId: listing.cityId,
    title: listing.title,
    rentMinor: listing.rent.amountMinor,
    currency: listing.rent.currency,
    chargesIncluded: listing.chargesIncluded,
    areaM2: listing.areaM2,
    bedrooms: listing.bedrooms,
    rooms: listing.rooms,
    furnished: listing.furnished,
    location: listing.location
      ? { x: listing.location.lng, y: listing.location.lat }
      : null,
    locationPrecision: listing.locationPrecision,
    address: listing.address,
    photoUrl: listing.photoUrl,
    publishedAt: listing.publishedAt,
  };
}

export function fromRow(row: ListingRow): Listing {
  return {
    source: row.source,
    sourceId: row.sourceId,
    url: row.url,
    country: row.country as Listing["country"],
    cityId: row.cityId as CityId,
    title: row.title,
    rent: { amountMinor: row.rentMinor, currency: row.currency as Listing["rent"]["currency"] },
    chargesIncluded: row.chargesIncluded,
    areaM2: row.areaM2,
    bedrooms: row.bedrooms,
    rooms: row.rooms,
    furnished: row.furnished,
    location: row.location ? { lat: row.location.y, lng: row.location.x } : null,
    locationPrecision: row.locationPrecision as Listing["locationPrecision"],
    address: row.address,
    photoUrl: row.photoUrl,
    publishedAt: row.publishedAt,
  };
}

/**
 * Inserts new listings and refreshes known ones. A listing seen again is
 * marked as live (removedAt cleared) and its lastSeenAt bumped.
 */
export async function upsertListings(db: Database, items: Listing[]): Promise<void> {
  if (items.length === 0) return;
  const now = new Date();
  await db
    .insert(listings)
    .values(items.map((item) => ({ ...toRow(item), lastSeenAt: now })))
    .onConflictDoUpdate({
      target: [listings.source, listings.sourceId],
      set: {
        url: sql`excluded.url`,
        title: sql`excluded.title`,
        rentMinor: sql`excluded.rent_minor`,
        currency: sql`excluded.currency`,
        chargesIncluded: sql`excluded.charges_included`,
        areaM2: sql`excluded.area_m2`,
        bedrooms: sql`excluded.bedrooms`,
        rooms: sql`excluded.rooms`,
        furnished: sql`excluded.furnished`,
        location: sql`excluded.location`,
        locationPrecision: sql`excluded.location_precision`,
        address: sql`excluded.address`,
        photoUrl: sql`excluded.photo_url`,
        publishedAt: sql`excluded.published_at`,
        lastSeenAt: now,
        removedAt: null,
      },
    });
}

/** Marks as removed the listings of a source and city not seen since `seenBefore`. */
export async function markUnseenAsRemoved(
  db: Database,
  source: string,
  cityId: CityId,
  seenBefore: Date,
): Promise<number> {
  const removed = await db
    .update(listings)
    .set({ removedAt: new Date() })
    .where(
      and(
        eq(listings.source, source),
        eq(listings.cityId, cityId),
        lt(listings.lastSeenAt, seenBefore),
        isNull(listings.removedAt),
      ),
    )
    .returning({ id: listings.id });
  return removed.length;
}

export async function activeListings(db: Database, cityIds: CityId[]): Promise<Listing[]> {
  const rows = await db
    .select()
    .from(listings)
    .where(and(inArray(listings.cityId, cityIds), isNull(listings.removedAt)));
  return rows.map(fromRow);
}
