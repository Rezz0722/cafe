#!/usr/bin/env bash
# Private, bounded evidence before Compose removes the old application container.
set -Eeuo pipefail
umask 077
container_id="${1:-}"
backup_dir="${KUCAFE_BACKUP_DIR:-/var/backups/kucafe}"
[[ "$container_id" =~ ^[a-f0-9]{64}$ ]] || { echo 'Expected an exact Docker container ID.' >&2; exit 1; }
[[ "$backup_dir" == /* && "$backup_dir" != / && -d "$backup_dir" ]] || { echo 'Unsafe backup directory.' >&2; exit 1; }
identity="$(docker inspect --format '{{index .Config.Labels "ir.kucafe.project"}}/{{index .Config.Labels "ir.kucafe.component"}}' "$container_id")"
[[ "$identity" == kucafe/application ]] || { echo 'Refusing to archive a non-KuCafe application.' >&2; exit 1; }
archive_dir="$backup_dir/app-logs"
[[ ! -L "$archive_dir" ]] || { echo 'Refusing a symlink archive directory.' >&2; exit 1; }
mkdir -p "$archive_dir"
chmod 700 "$archive_dir"
raw="$(mktemp "$archive_dir/.capture.XXXXXX")"
compressed="$(mktemp "$archive_dir/.compressed.XXXXXX")"
trap 'rm -f -- "$raw" "$compressed"' EXIT
docker logs --timestamps --since 24h --tail 20000 "$container_id" >"$raw" 2>&1
gzip -c "$raw" >"$compressed"
chmod 600 "$compressed"
destination="$archive_dir/app-$(date -u +%Y%m%dT%H%M%S)-${container_id:0:12}.log.gz"
[[ ! -e "$destination" ]] || { echo 'Archive already exists; refusing overwrite.' >&2; exit 1; }
mv "$compressed" "$destination"
mapfile -t archives < <(find "$archive_dir" -maxdepth 1 -type f -name 'app-*.log.gz' -printf '%T@|%p\n' | sort -rn)
for expired in "${archives[@]:5}"; do
  candidate="${expired#*|}"
  [[ "$candidate" == "$archive_dir"/app-*.log.gz && -f "$candidate" ]] && rm -f -- "$candidate"
done
echo 'Private pre-deploy application log archive saved (24h / 20,000 lines; latest 5 archives).'
