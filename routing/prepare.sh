#!/bin/sh
# Downloads and trims the open data MOTIS needs, into /input.
# Runs in the `routing-prepare` container (Debian); see refresh.sh.
#
# Travel times are computed for a single pinned day (first_day in config.yml),
# so the files are downloaded once and kept: a new run only fetches what is
# missing, or a timetable that did not cover that day yet. To start over,
# delete the `routing-input` volume.
set -eu

apt-get update -qq
apt-get install -y -qq --no-install-recommends ca-certificates curl osmium-tool unzip >/dev/null

day=$(sed -n 's/^  first_day: "\([0-9-]*\)"$/\1/p' /routing/config.yml)
[ -n "$day" ] || { echo "no first_day date in config.yml" >&2; exit 1; }
ymd=$(echo "$day" | tr -d -)

cd /input
fetch() {
  [ -f "$1" ] && return 0
  echo "downloading $2"
  curl -fsSL --retry 3 -o "$1.tmp" "$2" && mv "$1.tmp" "$1" || { rm -f "$1.tmp"; return 1; }
}

# Whether a GTFS file runs any service on the pinned day, a Monday: a weekly
# pattern in calendar.txt or an added date in calendar_dates.txt.
covers() {
  unzip -p "$1" calendar.txt calendar_dates.txt 2>/dev/null | tr -d '\r"' | awk -F, -v day="$ymd" '
    { sub(/^\357\273\277/, "") }
    /service_id/ { split("", col); for (i = 1; i <= NF; i++) col[$i] = i; next }
    ("monday" in col) && $col["monday"] == 1 && $col["start_date"] <= day && $col["end_date"] >= day { found = 1 }
    ("exception_type" in col) && $col["date"] == day && $col["exception_type"] == 1 { found = 1 }
    END { exit !found }'
}

# Keeps a timetable that covers the day; otherwise downloads it again and
# keeps it only if the new one does.
timetable() {
  if [ -f "$1" ] && covers "$1"; then return 0; fi
  rm -f "$1"
  fetch "$1" "$2" || return 1
  covers "$1" && return 0
  echo "$1 has no service on $day"
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

# Timetables (GTFS). Paris and London publish weeks ahead; they must cover the day.
timetable idfm.gtfs.zip "${GTFS_IDFM_URL:-https://eu.ftp.opendatasoft.com/stif/GTFS/IDFM-gtfs.zip}"
# Bus Open Data Service, London region: buses, Underground, DLR, trams.
timetable london.gtfs.zip "${GTFS_LONDON_URL:-https://data.bus-data.dft.gov.uk/timetable/download/gtfs-file/london/}"

cp /routing/config.yml config.yml
# STAR (Rennes) only publishes the current week, plus the next timetable
# version when one is announced. If neither covers the day yet, Rennes is left
# out (walking times only) until a later run, in the week before that day.
if ! timetable star.gtfs.zip "${GTFS_STAR_URL:-https://eu.ftp.opendatasoft.com/star/gtfs/GTFS_STAR_BUS_METRO_EN_COURS.zip}" &&
  ! { timetable star.next.zip "${GTFS_STAR_NEXT_URL:-https://eu.ftp.opendatasoft.com/star/gtfs/GTFS_STAR_BUS_METRO_A_VENIR.zip}" &&
    mv star.next.zip star.gtfs.zip; }; then
  echo "WARNING: no STAR timetable covers $day yet; Rennes will only have walking times"
  sed -i '/^    star:$/,/^      path: star.gtfs.zip$/d' config.yml
fi

chmod -R a+rX /input
ls -lh /input
