CREATE TABLE "geocode_cache" (
	"city_id" varchar(32) NOT NULL,
	"query" text NOT NULL,
	"label" text,
	"lat" double precision,
	"lng" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "geocode_cache_city_id_query_pk" PRIMARY KEY("city_id","query")
);
--> statement-breakpoint
CREATE TABLE "travel_time_cache" (
	"arrive_by" timestamp with time zone NOT NULL,
	"destination" varchar(24) NOT NULL,
	"origin" varchar(24) NOT NULL,
	"minutes" smallint,
	CONSTRAINT "travel_time_cache_arrive_by_destination_origin_pk" PRIMARY KEY("arrive_by","destination","origin")
);
