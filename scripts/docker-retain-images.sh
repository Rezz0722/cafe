#!/usr/bin/env bash
# Retain only the newest KuCafe application/maintenance image pairs.
# No global prune is used because this host runs unrelated Docker projects.
set -euo pipefail

keep="${KUCAFE_IMAGE_RETENTION:-5}"
if [[ ! "$keep" =~ ^[1-9][0-9]*$ ]]; then
  echo 'KUCAFE_IMAGE_RETENTION must be a positive integer.' >&2
  exit 2
fi

running_ids="$(docker ps --format '{{.Image}}' | while read -r image; do
  docker image inspect --format '{{.Id}}' "$image" 2>/dev/null || true
done | sort -u)"

for repository in kucafe/app kucafe/maintenance; do
  mapfile -t rows < <(docker image ls "$repository" --format '{{.CreatedAt}}|{{.ID}}|{{.Repository}}:{{.Tag}}' | sort -r)
  if (( ${#rows[@]} <= keep )); then
    continue
  fi

  for row in "${rows[@]:keep}"; do
    image_id="${row#*|}"; image_id="${image_id%%|*}"
    image_ref="${row##*|}"
    if grep -qxF "$image_id" <<<"$running_ids"; then
      echo "Keeping running image $image_ref"
      continue
    fi
    docker image rm "$image_ref" >/dev/null || true
    echo "Removed expired KuCafe image $image_ref"
  done
done
