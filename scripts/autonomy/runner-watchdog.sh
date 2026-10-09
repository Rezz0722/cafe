#!/usr/bin/env bash
set -Eeuo pipefail
# Do not touch the runner while the exact protected release is fetching/building.
flock -n /run/lock/kucafe-release-fetch.lock -c true || { echo 'Release fetch active; skip runner recovery'; exit 0; }
flock -n /run/lock/kucafe-deploy.lock -c true || { echo 'Deploy active; skip runner recovery'; exit 0; }
exec /usr/bin/node /opt/kucafe-autonomy/scripts/autonomy/runner-watchdog.mjs
