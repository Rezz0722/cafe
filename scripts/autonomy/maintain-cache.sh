#!/usr/bin/env bash
set -Eeuo pipefail
# Same ordering and exact locks as the production fetch/deploy wrapper.
exec 8>/run/lock/kucafe-release-fetch.lock
flock -n 8 || { echo 'Deploy active: skip cache maintenance'; exit 0; }
exec 9>/run/lock/kucafe-deploy.lock
flock -n 9 || { echo 'Deploy active: skip cache maintenance'; exit 0; }
if pgrep -f '[d]ocker (build|buildx build)|[b]uildctl build' >/dev/null; then echo 'Builder active: skip cache maintenance'; exit 0; fi
node "$(dirname "${BASH_SOURCE[0]}")/maintain-cache.mjs"
