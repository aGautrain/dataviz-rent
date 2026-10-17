"""Builds a tiny network for testing the MOTIS integration in CI.

A 7 km by 2 km grid of streets, with a metro line along its middle street:
stop A near the west end, stop B near the east end, a train every 10 minutes
taking 6 minutes.
Walking end to end takes well over an hour, so a short travel time proves the
transit leg was used.

A second line, C to D along the northern edge, comes from a feed whose
timetable ended two days ago, like STAR's rolling week. It only runs on the
next working day if MOTIS's extend_calendar repeats its weekly pattern.

    python3 routing/test/make_fixture.py OUT_DIR
    osmium cat OUT_DIR/town.osm -o OUT_DIR/town.osm.pbf
"""

import sys
import zipfile
from datetime import date, timedelta
from pathlib import Path

LAT = 48.0
WEST, EAST = 2.000, 2.100
SOUTH, NORTH = 47.990, 48.010
STEP = 0.001


def osm_xml() -> str:
    """A grid of streets every ~100 m. Routers drop tiny isolated street
    networks, so the town needs a few thousand nodes to be kept."""
    cols = round((EAST - WEST) / STEP) + 1
    rows = round((NORTH - SOUTH) / STEP) + 1

    def node_id(row: int, col: int) -> int:
        return row * cols + col + 1

    lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<osm version="0.6" generator="dataviz-rent fixture">']
    for row in range(rows):
        for col in range(cols):
            lines.append(
                f'  <node id="{node_id(row, col)}" version="1" '
                f'lat="{SOUTH + row * STEP:.6f}" lon="{WEST + col * STEP:.6f}"/>'
            )
    way_id = 0
    streets = [[node_id(row, col) for col in range(cols)] for row in range(rows)]
    streets += [[node_id(row, col) for row in range(rows)] for col in range(cols)]
    for street in streets:
        way_id += 1
        lines.append(f'  <way id="{way_id}" version="1">')
        lines += [f'    <nd ref="{ref}"/>' for ref in street]
        lines.append('    <tag k="highway" v="residential"/>')
        lines.append("  </way>")
    lines += ["</osm>", ""]
    return "\n".join(lines)


def gtfs_files(
    route: str, stops: tuple[tuple[str, float, float], tuple[str, float, float]], start: date, end: date
) -> dict[str, str]:
    """One metro line between two stops, every 10 minutes from 5:00 to 23:00,
    every day from start to end."""
    (first, *_), (last, *_) = stops
    trips, stop_times = ["route_id,service_id,trip_id"], [
        "trip_id,arrival_time,departure_time,stop_id,stop_sequence"
    ]
    for index, minute in enumerate(range(5 * 60, 23 * 60, 10)):
        trip = f"t{index}"
        trips.append(f"{route},daily,{trip}")
        leave = f"{minute // 60:02d}:{minute % 60:02d}:00"
        arrive = f"{(minute + 6) // 60:02d}:{(minute + 6) % 60:02d}:00"
        stop_times.append(f"{trip},{leave},{leave},{first},1")
        stop_times.append(f"{trip},{arrive},{arrive},{last},2")
    return {
        "agency.txt": "agency_id,agency_name,agency_url,agency_timezone\n"
        "fx,Fixture Transit,https://example.com,Europe/Paris\n",
        "stops.txt": "stop_id,stop_name,stop_lat,stop_lon\n"
        + "".join(f"{stop},{stop},{lat},{lng}\n" for stop, lat, lng in stops),
        "routes.txt": f"route_id,agency_id,route_short_name,route_type\n{route},fx,{route},1\n",
        "calendar.txt": "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,"
        f"start_date,end_date\ndaily,1,1,1,1,1,1,1,{start:%Y%m%d},{end:%Y%m%d}\n",
        "feed_info.txt": "feed_publisher_name,feed_publisher_url,feed_lang,feed_end_date\n"
        f"Fixture,https://example.com,fr,{end:%Y%m%d}\n",
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
    short:
      path: short.gtfs.zip
      extend_calendar: true
limits:
  onetomany_max_many: 1000
"""


def main(out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    (out / "town.osm").write_text(osm_xml())
    today = date.today()
    feeds = {
        "town": gtfs_files("M1", (("A", LAT, 2.002), ("B", LAT, 2.098)), date(2020, 1, 1), date(2099, 12, 31)),
        "short": gtfs_files(
            "M2",
            (("C", NORTH, 2.002), ("D", NORTH, 2.098)),
            today - timedelta(days=9),
            today - timedelta(days=2),
        ),
    }
    for feed, files in feeds.items():
        with zipfile.ZipFile(out / f"{feed}.gtfs.zip", "w") as archive:
            for name, content in files.items():
                archive.writestr(name, content)
    (out / "config.yml").write_text(CONFIG)


if __name__ == "__main__":
    main(Path(sys.argv[1]))
