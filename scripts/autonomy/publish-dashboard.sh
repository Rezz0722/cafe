#!/usr/bin/env bash
# Publish read-only reporting UI from an exact reviewed protected GitHub revision.
# Independent Apache report assets: does not mutate the application, DB, units or checkpoint.
set -Eeuo pipefail
revision="${1:?Pass current protected dashboard revision}"
source_repo="${KUCAFE_AUTONOMY_SOURCE_REPO:-/opt/kucafe-phase3-evidence}"
[[ "$EUID" == 0 && "$revision" =~ ^[a-f0-9]{40}$ ]] || exit 1
git -C "$source_repo" fetch origin production
[[ "$(git -C "$source_repo" rev-parse origin/production)" == "$revision" ]] || exit 1
reviewed_head="$(gh api "repos/Rezz0722/cafe/commits/$revision/pulls" --jq ".[] | select(.merged_at!=null and .base.ref==\"production\" and .merge_commit_sha==\"$revision\") | .head.sha")"
[[ "$reviewed_head" =~ ^[a-f0-9]{40}$ ]] || exit 1
gh api "repos/Rezz0722/cafe/actions/runs?head_sha=$reviewed_head&per_page=20" --jq '.workflow_runs[] | select(.name=="CI" and .status=="completed" and .conclusion=="success") | .id' | rg -q '^[0-9]+$'
artifact_dir="$(mktemp -d /var/lib/kucafe-autonomy/dashboard-release.XXXXXX)"
git -C "$source_repo" archive "$revision" scripts/autonomy/dashboard public/fonts/Vazirmatn-400.woff2 | tar -x -C "$artifact_dir"
node --check "$artifact_dir/scripts/autonomy/dashboard/dashboard.mjs"
install -d -m 0755 /var/www/html/kucafe-autonomy
snapshot_dir="/var/lib/kucafe-autonomy/dashboard-snapshots/$revision"
install -d -m 0700 "$snapshot_dir"
for name in index.html dashboard.css dashboard.mjs view-model.mjs; do
  if [[ -f "/var/www/html/kucafe-autonomy/$name" && ! -e "$snapshot_dir/$name" ]]; then cp "/var/www/html/kucafe-autonomy/$name" "$snapshot_dir/$name"; fi
  install -m 0644 "$artifact_dir/scripts/autonomy/dashboard/$name" "/var/www/html/kucafe-autonomy/$name.tmp"
  mv "/var/www/html/kucafe-autonomy/$name.tmp" "/var/www/html/kucafe-autonomy/$name"
done
install -m 0644 "$artifact_dir/public/fonts/Vazirmatn-400.woff2" /var/www/html/kucafe-autonomy/Vazirmatn-400.woff2
[[ "$artifact_dir" =~ ^/var/lib/kucafe-autonomy/dashboard-release\.[A-Za-z0-9]{6}$ ]] || exit 1
for name in index.html dashboard.css dashboard.mjs view-model.mjs; do rm -- "$artifact_dir/scripts/autonomy/dashboard/$name"; done
rm -- "$artifact_dir/public/fonts/Vazirmatn-400.woff2"
rmdir "$artifact_dir/scripts/autonomy/dashboard" "$artifact_dir/scripts/autonomy" "$artifact_dir/scripts" "$artifact_dir/public/fonts" "$artifact_dir/public" "$artifact_dir"
echo "Published read-only reporting dashboard from protected SHA $revision; snapshot $snapshot_dir"
