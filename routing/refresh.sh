#!/bin/sh
# Rebuilds the travel-time data from fresh downloads and restarts MOTIS.
# Run from the project directory on the server (deploy/ansible/routing.yml
# installs a nightly cron job for it). MOTIS keeps answering during the
# downloads, then stops for the import, which needs the memory: meanwhile the
# app shows results without travel times. It is restarted even if a step
# fails, on the data it had.
set -eu
cd "$(dirname "$0")/.."

docker compose --profile routing-import run --rm routing-prepare
trap 'docker compose --profile routing up -d routing' EXIT
docker compose --profile routing stop routing
docker compose --profile routing-import run --rm routing-import
