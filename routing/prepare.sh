#!/bin/sh
# Downloads and trims the open data MOTIS needs, into /input.
# Runs in the `routing-prepare` container (Debian); see refresh.sh.
set -eu

apt-get update -qq
apt-get install -y -qq --no-install-recommends ca-certificates curl osmium-tool >/dev/null

cd /input
fetch() {
  echo "downloading $2"
  curl -fsSL --retry 3 -o "$1.tmp" "$2"
  mv "$1.tmp" "$1"
}

# OpenStreetMap (Geofabrik), cut to each city and its inner suburbs so the
# street graph fits a small server.
fetch idf.osm.pbf "${OSM_IDF_URL:-https://download.geofabrik.de/europe/france/ile-de-france-latest.osm.pbf}"
fetch bretagne.osm.pbf "${OSM_BRETAGNE_URL:-https://download.geofabrik.de/europe/france/bretagne-latest.osm.pbf}"
fetch london.osm.pbf "${OSM_LONDON_URL:-https://download.geofabrik.de/europe/united-kingdom/england/greater-london-latest.osm.pbf}"
osmium extract --overwrite -b 2.15,48.75,2.55,48.97 idf.osm.pbf -o paris-area.osm.pbf
osmium extract --overwrite -b -1.8,48.03,-1.55,48.2 bretagne.osm.pbf -o rennes-area.osm.pbf
osmium merge --overwrite paris-area.osm.pbf rennes-area.osm.pbf london.osm.pbf -o region.osm.pbf
rm -f idf.osm.pbf bretagne.osm.pbf paris-area.osm.pbf rennes-area.osm.pbf london.osm.pbf

# Timetables (GTFS).
fetch idfm.gtfs.zip "${GTFS_IDFM_URL:-https://eu.ftp.opendatasoft.com/stif/GTFS/IDFM-gtfs.zip}"
fetch star.gtfs.zip "${GTFS_STAR_URL:-https://eu.ftp.opendatasoft.com/star/gtfs/GTFS_STAR_BUS_METRO_EN_COURS.zip}"
# Bus Open Data Service, London region: buses, Underground, DLR, trams.
fetch london.gtfs.zip "${GTFS_LONDON_URL:-https://data.bus-data.dft.gov.uk/timetable/download/gtfs-file/london/}"

cp /routing/config.yml config.yml
chmod -R a+rX /input
ls -lh /input
