import { sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  geometry,
  index,
  integer,
  pgTable,
  primaryKey,
  real,
  smallint,
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

/**
 * Answers from the address geocoders (BAN, Nominatim), so each address is
 * only asked once. A row without a label is an address they did not find.
 */
export const geocodeCache = pgTable(
  "geocode_cache",
  {
    cityId: varchar("city_id", { length: 32 }).notNull(),
    /** The address as typed, trimmed and lower-cased. */
    query: text("query").notNull(),
    label: text("label"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.cityId, table.query] })],
);

/**
 * Travel times computed by MOTIS. The timetable is pinned to one day, so a
 * time never goes stale: each listing position is routed once per address.
 * Positions are rounded to ~10 m (src/routing/cache.ts).
 */
export const travelTimeCache = pgTable(
  "travel_time_cache",
  {
    arriveBy: timestamp("arrive_by", { withTimezone: true }).notNull(),
    destination: varchar("destination", { length: 24 }).notNull(),
    origin: varchar("origin", { length: 24 }).notNull(),
    /** Null: no route within the engine's limit. */
    minutes: smallint("minutes"),
  },
  (table) => [
    primaryKey({ columns: [table.arriveBy, table.destination, table.origin] }),
  ],
);
