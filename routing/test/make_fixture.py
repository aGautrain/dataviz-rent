"""Builds a tiny network for testing the MOTIS integration in CI.

One 7 km street running east-west, with a metro line along it: stop A near the
west end, stop B near the east end, a train every 10 minutes taking 6 minutes.
Walking end to end takes well over an hour, so a short travel time proves the
transit leg was used.

    python3 routing/test/make_fixture.py OUT_DIR
    osmium cat OUT_DIR/town.osm -o OUT_DIR/town.osm.pbf
"""

import sys
import zipfile
from pathlib import Path

LAT = 48.0
WEST, EAST, STEP = 2.000, 2.100, 0.002


def osm_xml() -> str:
    count = round((EAST - WEST) / STEP) + 1
    nodes = [
        f'  <node id="{i + 1}" version="1" lat="{LAT:.6f}" lon="{WEST + i * STEP:.6f}"/>'
        for i in range(count)
    ]
    refs = "\n".join(f'    <nd ref="{i + 1}"/>' for i in range(count))
    return "\n".join(
        [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<osm version="0.6" generator="dataviz-rent fixture">',
            *nodes,
            '  <way id="1" version="1">',
            refs,
            '    <tag k="highway" v="residential"/>',
            '    <tag k="name" v="Grande Rue"/>',
            "  </way>",
            "</osm>",
            "",
        ]
    )


def gtfs_files() -> dict[str, str]:
    trips, stop_times = ["route_id,service_id,trip_id"], [
        "trip_id,arrival_time,departure_time,stop_id,stop_sequence"
    ]
    for index, minute in enumerate(range(5 * 60, 23 * 60, 10)):
        trip = f"t{index}"
        trips.append(f"m1,daily,{trip}")
        start = f"{minute // 60:02d}:{minute % 60:02d}:00"
        end = f"{(minute + 6) // 60:02d}:{(minute + 6) % 60:02d}:00"
        stop_times.append(f"{trip},{start},{start},A,1")
        stop_times.append(f"{trip},{end},{end},B,2")
    return {
        "agency.txt": "agency_id,agency_name,agency_url,agency_timezone\n"
        "fx,Fixture Transit,https://example.com,Europe/Paris\n",
        "stops.txt": "stop_id,stop_name,stop_lat,stop_lon\n"
        f"A,Ouest,{LAT},2.002\nB,Est,{LAT},2.098\n",
        "routes.txt": "route_id,agency_id,route_short_name,route_type\nm1,fx,M1,1\n",
        "calendar.txt": "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,"
        "start_date,end_date\ndaily,1,1,1,1,1,1,1,20200101,20991231\n",
        "trips.txt": "\n".join(trips) + "\n",
        "stop_times.txt": "\n".join(stop_times) + "\n",
    }


CONFIG = """osm: town.osm.pbf
street_routing: true
timetable:
  first_day: TODAY
  num_days: 14
  datasets:
    fx:
      path: town.gtfs.zip
limits:
  onetomany_max_many: 1000
"""


def main(out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    (out / "town.osm").write_text(osm_xml())
    with zipfile.ZipFile(out / "town.gtfs.zip", "w") as archive:
        for name, content in gtfs_files().items():
            archive.writestr(name, content)
    (out / "config.yml").write_text(CONFIG)


if __name__ == "__main__":
    main(Path(sys.argv[1]))
