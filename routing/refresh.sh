#!/bin/sh
# Builds the travel-time data and (re)starts MOTIS. Run from the project
# directory on the server (deploy/ansible/routing.yml runs it). The timetables
# are pinned to one day, so this runs once; run it again only to change that
# day or to add a timetable that was missing (see prepare.sh). MOTIS keeps
# answering during the downloads, then stops for the import, which needs the
# memory, and is restarted even if the import fails.
set -eu
cd "$(dirname "$0")/.."

docker compose --profile routing-import run --rm routing-prepare
trap 'docker compose --profile routing up -d routing' EXIT
docker compose --profile routing stop routing
docker compose --profile routing-import run --rm routing-import
