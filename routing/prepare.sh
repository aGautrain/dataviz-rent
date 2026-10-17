#!/bin/sh
# Downloads and trims the open data MOTIS needs, into /input.
# Runs in the `routing-prepare` container (Debian); see refresh.sh.
#
# Travel times are computed for one pinned day per country, so the files are
# downloaded once and kept: a new run only fetches what is missing. The pinned
# days are in the past once chosen, and feeds only cover today onwards, so a
# file deleted now cannot be downloaded again with those days in it: keep (or
# back up) the `routing-input` volume.
set -eu

# Must match TIMETABLE_DAYS in src/routing/arrival.ts (checked by a test).
FR_DAY=2026-10-15
GB_DAY=2026-10-19

apt-get update -qq
apt-get install -y -qq --no-install-recommends ca-certificates curl osmium-tool unzip >/dev/null

cd /input
fetch() {
  [ -f "$1" ] && return 0
  echo "downloading $2"
  curl -fsSL --retry 3 -o "$1.tmp" "$2" && mv "$1.tmp" "$1" || { rm -f "$1.tmp"; return 1; }
}

# Whether a GTFS file runs any service on a day (YYYY-MM-DD): its weekday in
# a calendar.txt pattern, or an added date in calendar_dates.txt.
covers() {
  weekday=$(LC_ALL=C date -d "$2" +%A | tr A-Z a-z)
  unzip -p "$1" calendar.txt calendar_dates.txt 2>/dev/null | tr -d '\r"' |
    awk -F, -v day="$(echo "$2" | tr -d -)" -v weekday="$weekday" '
    { sub(/^\357\273\277/, "") }
    /service_id/ { split("", col); for (i = 1; i <= NF; i++) col[$i] = i; next }
    (weekday in col) && $col[weekday] == 1 && $col["start_date"] <= day && $col["end_date"] >= day { found = 1 }
    ("exception_type" in col) && $col["date"] == day && $col["exception_type"] == 1 { found = 1 }
    END { exit !found }'
}

# Makes sure a timetable (file, url, day) is there and covers the day. A file
# already there is never deleted, since it may not be downloadable any more;
# a new download that misses the day is not kept.
timetable() {
  if [ -f "$1" ]; then
    covers "$1" "$3" && return 0
    echo "$1 (kept from an earlier run) has no service on $3"
    return 1
  fi
  fetch "$1" "$2" || return 1
  covers "$1" "$3" && return 0
  echo "$1 (just downloaded) has no service on $3"
  rm "$1"
  return 1
}

# OpenStreetMap (Geofabrik), cut to each city and its inner suburbs so the
# street graph fits a small server.
if [ ! -f region.osm.pbf ]; then
  fetch idf.osm.pbf "${OSM_IDF_URL:-https://download.geofabrik.de/europe/france/ile-de-france-latest.osm.pbf}"
  fetch bretagne.osm.pbf "${OSM_BRETAGNE_URL:-https://download.geofabrik.de/europe/france/bretagne-latest.osm.pbf}"
  fetch london.osm.pbf "${OSM_LONDON_URL:-https://download.geofabrik.de/europe/united-kingdom/england/greater-london-latest.osm.pbf}"
  osmium extract --overwrite -b 2.15,48.75,2.55,48.97 idf.osm.pbf -o paris-area.osm.pbf
  osmium extract --overwrite -b -1.8,48.03,-1.55,48.2 bretagne.osm.pbf -o rennes-area.osm.pbf
  osmium merge --overwrite paris-area.osm.pbf rennes-area.osm.pbf london.osm.pbf -o region.osm.pbf.tmp
  mv region.osm.pbf.tmp region.osm.pbf
  rm -f idf.osm.pbf bretagne.osm.pbf paris-area.osm.pbf rennes-area.osm.pbf london.osm.pbf
fi

# Timetables (GTFS). Paris and London must cover their day.
timetable idfm.gtfs.zip "${GTFS_IDFM_URL:-https://eu.ftp.opendatasoft.com/stif/GTFS/IDFM-gtfs.zip}" "$FR_DAY"
# Bus Open Data Service, London region: buses, Underground, DLR, trams.
timetable london.gtfs.zip "${GTFS_LONDON_URL:-https://data.bus-data.dft.gov.uk/timetable/download/gtfs-file/london/}" "$GB_DAY"

cp /routing/config.yml config.yml
# STAR (Rennes) only publishes about a week ahead. If its file does not cover
# the day, Rennes is left out (walking times only) rather than failing.
if ! timetable star.gtfs.zip "${GTFS_STAR_URL:-https://eu.ftp.opendatasoft.com/star/gtfs/GTFS_STAR_BUS_METRO_EN_COURS.zip}" "$FR_DAY"; then
  echo "WARNING: the STAR timetable does not cover $FR_DAY; Rennes will only have walking times"
  sed -i '/^    star:$/,/^      path: star.gtfs.zip$/d' config.yml
fi

chmod -R a+rX /input
ls -lh /input
