#!/bin/sh
# Rebuilds the travel-time data from fresh downloads and restarts MOTIS.
# Run from the project directory on the server (deploy/ansible/routing.yml
# installs a weekly cron job for it). MOTIS is stopped meanwhile: the import
# needs the memory, and the app shows results without travel times until the
# server is back.
set -eu
cd "$(dirname "$0")/.."

docker compose --profile routing stop routing
docker compose --profile routing-import run --rm routing-prepare
docker compose --profile routing-import run --rm routing-import
docker compose --profile routing up -d routing
