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

read -r -a repositories <<<"${KUCAFE_IMAGE_REPOSITORIES:-kucafe/app kucafe/maintenance}"
for repository in "${repositories[@]}"; do
  [[ "$repository" == kucafe/* ]] || {
    echo "Refusing to manage an image repository outside kucafe/*: $repository" >&2
    exit 2
  }
  mapfile -t rows < <(docker image ls "$repository" --format '{{.CreatedAt}}|{{.ID}}|{{.Repository}}:{{.Tag}}' | sort -r)
  if (( ${#rows[@]} <= keep )); then
    continue
  fi

  for row in "${rows[@]:keep}"; do
    image_id="${row#*|}"; image_id="${image_id%%|*}"
    image_ref="${row##*|}"
    full_image_id="$(docker image inspect --format '{{.Id}}' "$image_ref" 2>/dev/null || true)"
    if [[ -n "$full_image_id" ]] && grep -qxF "$full_image_id" <<<"$running_ids"; then
      echo "Keeping running image $image_ref"
      continue
    fi
    if docker image rm "$image_ref" >/dev/null; then
      echo "Removed expired KuCafe image $image_ref"
    else
      echo "Could not remove expired KuCafe image $image_ref" >&2
    fi
  done
done
