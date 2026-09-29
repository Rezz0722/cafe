#!/usr/bin/env bash
# Build, back up, migrate and deploy the exact checked-out Git commit.
set -Eeuo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="${KUCAFE_ENV_FILE:-/opt/kucafe/.env.local}"
media_dir="${KUCAFE_MEDIA_DIR:-/var/www/kucafe/public/media}"
backup_dir="${KUCAFE_BACKUP_DIR:-/var/backups/kucafe}"
state_dir="${KUCAFE_DEPLOY_STATE_DIR:-/var/lib/kucafe}"
lock_file="${KUCAFE_DEPLOY_LOCK_FILE:-/run/lock/kucafe-deploy.lock}"
port="${KUCAFE_PORT:-3100}"
revision="${GITHUB_SHA:-$(git -C "$project_dir" rev-parse HEAD)}"
tag="sha-${revision:0:12}"

for required in docker git curl flock; do
  command -v "$required" >/dev/null || { echo "Missing command: $required" >&2; exit 1; }
done
docker compose version >/dev/null
[[ -r "$env_file" ]] || { echo "Production env is not readable: $env_file" >&2; exit 1; }
[[ -d "$media_dir" && "$media_dir" != / ]] || { echo "Unsafe or missing media directory: $media_dir" >&2; exit 1; }
mkdir -p "$backup_dir/db" "$state_dir" "$(dirname "$lock_file")"
exec 9>"$lock_file"
flock -n 9 || { echo 'Another KuCafe deployment is running.' >&2; exit 75; }

if [[ -n "$(git -C "$project_dir" status --porcelain --untracked-files=no)" ]]; then
  echo 'Tracked files are dirty; refusing a non-reproducible deployment.' >&2
  exit 1
fi

previous_tag=""
[[ -f "$state_dir/current-image" ]] && previous_tag="$(<"$state_dir/current-image")"
compose=(docker compose --project-directory "$project_dir" -f "$project_dir/compose.yaml")
export KUCAFE_ENV_FILE="$env_file" KUCAFE_MEDIA_DIR="$media_dir" KUCAFE_BACKUP_DIR="$backup_dir" KUCAFE_PORT="$port"

rollback_app() {
  local exit_code=$?
  echo "Deployment of $tag failed (exit $exit_code)." >&2
  if [[ -n "$previous_tag" ]] && docker image inspect "kucafe/app:$previous_tag" >/dev/null 2>&1; then
    echo "Rolling application container back to $previous_tag" >&2
    KUCAFE_IMAGE_TAG="$previous_tag" "${compose[@]}" up -d --no-build app || true
  fi
  exit "$exit_code"
}
trap rollback_app ERR

echo "Building KuCafe revision $revision as $tag"
docker build --network host \
  --secret "id=kucafe_env,src=$env_file" \
  --build-arg NEXT_PUBLIC_SITE_URL="${NEXT_PUBLIC_SITE_URL:-https://kucafe.ir}" \
  --build-arg NEXT_DEPLOYMENT_ID="$tag" \
  --label ir.kucafe.project=kucafe --label ir.kucafe.revision="$revision" \
  --target runtime -t "kucafe/app:$tag" "$project_dir"
docker build --network host \
  --label ir.kucafe.project=kucafe --label ir.kucafe.revision="$revision" \
  --target maintenance -t "kucafe/maintenance:$tag" "$project_dir"

backup_name="kucafe-before-${tag}-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
KUCAFE_IMAGE_TAG="$tag" "${compose[@]}" --profile maintenance run --rm --no-deps \
  maintenance node scripts/backup-db.mjs "/backups/db/$backup_name"
mapfile -t db_backups < <(find "$backup_dir/db" -maxdepth 1 -type f -name 'kucafe-before-*.sql.gz' -printf '%T@|%p\n' | sort -rn)
for expired in "${db_backups[@]:5}"; do
  candidate="${expired#*|}"
  [[ "$candidate" == "$backup_dir/db"/* && -f "$candidate" ]] && rm -f -- "$candidate"
done

KUCAFE_IMAGE_TAG="$tag" "${compose[@]}" --profile maintenance run --rm --no-deps \
  maintenance npm run db:migrate
KUCAFE_IMAGE_TAG="$tag" "${compose[@]}" up -d --no-build --remove-orphans app

healthy=0
for _ in {1..40}; do
  status="$(curl -sS --max-time 3 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/robots.txt" 2>/dev/null || true)"
  if [[ "$status" == 200 ]]; then healthy=1; break; fi
  sleep 3
done
[[ "$healthy" == 1 ]] || { echo 'New container did not become healthy.' >&2; false; }

# After the one-time Apache cutover, include the real public path in every
# deployment gate. Before cutover Apache still points at PM2, so this check is
# intentionally conditional.
if grep -q '127\.0\.0\.1:3100' /etc/httpd/conf/extra/kucafe-tls.conf 2>/dev/null; then
  curl --fail --silent --show-error --max-time 20 https://kucafe.ir/robots.txt >/dev/null
  curl --fail --silent --show-error --max-time 20 https://kucafe.ir/manifest.webmanifest >/dev/null
fi

printf '%s\n' "$tag" > "$state_dir/current-image"
printf '%s\n' "$revision" > "$state_dir/current-revision"
trap - ERR
KUCAFE_IMAGE_RETENTION=5 bash "$project_dir/scripts/docker-retain-images.sh"
echo "KuCafe $tag is healthy on 127.0.0.1:$port"
