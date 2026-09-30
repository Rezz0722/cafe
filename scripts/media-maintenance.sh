#!/usr/bin/env bash
# Cron entry point: refresh remote media, then create an incremental restore point.
set -Eeuo pipefail
project_dir="${KUCAFE_PROJECT_DIR:-/opt/kucafe-release}"
env_file="${KUCAFE_ENV_FILE:-/opt/kucafe/.env.local}"
media_dir="${KUCAFE_MEDIA_DIR:-/var/www/kucafe/public/media}"
backup_dir="${KUCAFE_BACKUP_DIR:-/var/backups/kucafe}"
state_file="${KUCAFE_DEPLOY_STATE_DIR:-/var/lib/kucafe}/current-image"
[[ -r "$state_file" ]] || { echo 'No deployed maintenance image is recorded.' >&2; exit 1; }
tag="$(<"$state_file")"
export KUCAFE_ENV_FILE="$env_file" KUCAFE_MEDIA_DIR="$media_dir" KUCAFE_BACKUP_DIR="$backup_dir" KUCAFE_IMAGE_TAG="$tag"
docker compose --project-directory "$project_dir" -f "$project_dir/compose.yaml" \
  --profile maintenance run --rm --no-deps maintenance npm run media:download
bash "$project_dir/scripts/media-snapshot.sh"
