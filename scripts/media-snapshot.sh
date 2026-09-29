#!/usr/bin/env bash
# Incremental media snapshots. Unchanged files are hard-linked to the previous
# snapshot, so five restore points do not consume five times the media size.
set -euo pipefail

source_dir="${KUCAFE_MEDIA_DIR:-/var/www/kucafe/public/media}"
backup_root="${KUCAFE_MEDIA_BACKUP_DIR:-/var/backups/kucafe/media}"
retention="${KUCAFE_MEDIA_RETENTION:-5}"
lock_file="${KUCAFE_MEDIA_LOCK_FILE:-/run/lock/kucafe-media-snapshot.lock}"

if [[ ! -d "$source_dir" || "$source_dir" == / || -z "$source_dir" ]]; then
  echo "Unsafe or missing media source: $source_dir" >&2
  exit 1
fi
if [[ ! "$retention" =~ ^[1-9][0-9]*$ ]]; then
  echo 'KUCAFE_MEDIA_RETENTION must be a positive integer.' >&2
  exit 2
fi

mkdir -p "$backup_root" "$(dirname "$lock_file")"
exec 9>"$lock_file"
flock -n 9 || { echo 'Another media snapshot is running.' >&2; exit 75; }

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$backup_root/$stamp"
partial="$backup_root/.partial-$stamp"
latest=""
if [[ -L "$backup_root/latest" ]]; then
  latest="$(readlink -f "$backup_root/latest" || true)"
fi

mkdir -p "$partial"
rsync_args=(-a --delete --numeric-ids)
if [[ -n "$latest" && -d "$latest" && "$latest" == "$backup_root"/* ]]; then
  rsync_args+=(--link-dest="$latest")
fi
rsync "${rsync_args[@]}" "$source_dir/" "$partial/"
mv "$partial" "$target"
ln -sfn "$target" "$backup_root/latest"

mapfile -t snapshots < <(find "$backup_root" -mindepth 1 -maxdepth 1 -type d -name '20????????T??????Z' -printf '%f\n' | sort -r)
for expired in "${snapshots[@]:retention}"; do
  candidate="$backup_root/$expired"
  [[ "$candidate" == "$backup_root"/* && -d "$candidate" ]] || continue
  rm -rf --one-file-system -- "$candidate"
  echo "Removed expired media snapshot $candidate"
done

echo "Media snapshot ready: $target"
