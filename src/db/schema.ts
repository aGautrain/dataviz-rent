import { sql } from "drizzle-orm";
import {
  boolean,
  geometry,
  index,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const listings = pgTable(
  "listings",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    source: varchar("source", { length: 32 }).notNull(),
    sourceId: varchar("source_id", { length: 128 }).notNull(),
    url: text("url").notNull(),
    country: varchar("country", { length: 2 }).notNull(),
    cityId: varchar("city_id", { length: 32 }).notNull(),
    title: text("title").notNull(),
    rentMinor: integer("rent_minor").notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    chargesIncluded: boolean("charges_included"),
    areaM2: real("area_m2"),
    bedrooms: integer("bedrooms"),
    rooms: integer("rooms"),
    furnished: boolean("furnished"),
    /** WGS84 point, x = longitude, y = latitude. */
    location: geometry("location", { type: "point", mode: "xy", srid: 4326 }),
    locationPrecision: varchar("location_precision", { length: 8 }),
    address: text("address"),
    photoUrl: text("photo_url"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    /** Set when a listing stops appearing at its source. */
    removedAt: timestamp("removed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("listings_source_source_id_idx").on(table.source, table.sourceId),
    index("listings_city_rent_idx").on(table.cityId, table.rentMinor),
    index("listings_location_idx").using("gist", table.location),
    index("listings_active_idx")
      .on(table.cityId)
      .where(sql`${table.removedAt} is null`),
  ],
);

export type ListingRow = typeof listings.$inferSelect;
export type NewListingRow = typeof listings.$inferInsert;
