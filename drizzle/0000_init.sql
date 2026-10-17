CREATE EXTENSION IF NOT EXISTS postgis;
--> statement-breakpoint
CREATE TABLE "listings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "listings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"source" varchar(32) NOT NULL,
	"source_id" varchar(128) NOT NULL,
	"url" text NOT NULL,
	"country" varchar(2) NOT NULL,
	"city_id" varchar(32) NOT NULL,
	"title" text NOT NULL,
	"rent_minor" integer NOT NULL,
	"currency" varchar(3) NOT NULL,
	"charges_included" boolean,
	"area_m2" real,
	"bedrooms" integer,
	"rooms" integer,
	"furnished" boolean,
	"location" geometry(Point, 4326),
	"location_precision" varchar(8),
	"address" text,
	"photo_url" text,
	"published_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "listings_source_source_id_idx" ON "listings" USING btree ("source","source_id");--> statement-breakpoint
CREATE INDEX "listings_city_rent_idx" ON "listings" USING btree ("city_id","rent_minor");--> statement-breakpoint
CREATE INDEX "listings_location_idx" ON "listings" USING gist ("location");--> statement-breakpoint
CREATE INDEX "listings_active_idx" ON "listings" USING btree ("city_id") WHERE "listings"."removed_at" is null;