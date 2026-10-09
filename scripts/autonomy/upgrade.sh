#!/usr/bin/env bash
# Operator-only upgrade from exact protected SHA; retain checkpoints and rollback source.
set -Eeuo pipefail
source_repo="${KUCAFE_AUTONOMY_SOURCE_REPO:-/opt/kucafe-phase3-evidence}"
revision="${1:?Pass protected production SHA with green CI}"
[[ "$revision" =~ ^[a-f0-9]{40}$ && "$EUID" == 0 ]] || exit 1
git -C "$source_repo" fetch origin production
[[ "$(git -C "$source_repo" rev-parse origin/production)" == "$revision" ]] || exit 1
reviewed_head="$(gh api "repos/Rezz0722/cafe/commits/$revision/pulls" --jq ".[] | select(.merged_at!=null and .base.ref==\"production\" and .merge_commit_sha==\"$revision\") | .head.sha")"
[[ "$reviewed_head" =~ ^[a-f0-9]{40}$ ]] || { echo 'No exact protected merged PR' >&2; exit 1; }
gh api "repos/Rezz0722/cafe/actions/runs?head_sha=$reviewed_head&per_page=20" --jq '.workflow_runs[] | select(.name=="CI" and .status=="completed" and .conclusion=="success") | .id' | rg '^[0-9]+$' >/dev/null
released="$(< /var/lib/kucafe/current-revision)"
[[ "$released" =~ ^[a-f0-9]{40}$ ]] || exit 1
if [[ "$released" != "$revision" ]]; then
  # Controller-only deployment is independent from the Next application; never skip app changes.
  comparison="$(gh api "repos/Rezz0722/cafe/compare/$released...$revision" --jq '{status,total_commits,files:[.files[]|{filename}]}')"
  node --input-type=module -e 'const {isControllerOnlyComparison}=await import(process.argv[1]); if(!isControllerOnlyComparison(JSON.parse(process.argv[2]))) process.exit(1)' "$source_repo/scripts/autonomy/engineering-policy.mjs" "$comparison" || { echo 'Application changes present/uncertain: wait for exact app release' >&2; exit 1; }
  echo 'Verified controller-only diff; independent protected controller upgrade, not app release'
fi
[[ -d /opt/kucafe-autonomy && -d /var/lib/kucafe-autonomy ]] || exit 1
backup_dir="/var/lib/kucafe-autonomy/releases/$revision"
[[ ! -e "$backup_dir" ]] || { echo 'Existing snapshot: reconcile before repeating' >&2; exit 1; }
# Stop future timer firings BEFORE checking activity or copying source. The old
# order left a race where a tick could start while the new controller was unpacked.
watchdog_was_active="$(systemctl is-active kucafe-runner-watchdog.timer 2>/dev/null || true)"
systemctl stop kucafe-autonomy.timer
if [[ "$watchdog_was_active" == active ]]; then systemctl stop kucafe-runner-watchdog.timer; fi
trap 'systemctl start kucafe-autonomy.timer; if [[ "$watchdog_was_active" == active ]]; then systemctl start kucafe-runner-watchdog.timer; fi' ERR
[[ "$(systemctl show kucafe-autonomy.service --property=ActiveState --value)" == inactive ]] || { systemctl start kucafe-autonomy.timer; if [[ "$watchdog_was_active" == active ]]; then systemctl start kucafe-runner-watchdog.timer; fi; echo 'Wait for active tick' >&2; exit 1; }
if [[ "$watchdog_was_active" == active ]]; then
  [[ "$(systemctl show kucafe-runner-watchdog.service --property=ActiveState --value)" == inactive ]] || { systemctl start kucafe-autonomy.timer; systemctl start kucafe-runner-watchdog.timer; echo 'Wait for active runner watchdog check' >&2; exit 1; }
fi
install -d -m 0700 "$backup_dir"
tar -czf "$backup_dir/previous-source.tgz" -C /opt/kucafe-autonomy scripts/autonomy docs/KUCAFE_AUTONOMY_FA.md
cp /etc/systemd/system/kucafe-autonomy.service "$backup_dir/previous.service"
cp /etc/systemd/system/kucafe-autonomy.timer "$backup_dir/previous.timer"
if [[ -f /etc/systemd/system/kucafe-autonomy-maintenance.service ]]; then cp /etc/systemd/system/kucafe-autonomy-maintenance.service "$backup_dir/previous-maintenance.service"; fi
if [[ -f /etc/systemd/system/kucafe-runner-watchdog.service ]]; then cp /etc/systemd/system/kucafe-runner-watchdog.service "$backup_dir/previous-runner-watchdog.service"; fi
if [[ -f /etc/systemd/system/kucafe-runner-watchdog.timer ]]; then cp /etc/systemd/system/kucafe-runner-watchdog.timer "$backup_dir/previous-runner-watchdog.timer"; fi
exec 9>/var/lib/kucafe-autonomy/run.lock
flock -n 9 || { systemctl start kucafe-autonomy.timer; if [[ "$watchdog_was_active" == active ]]; then systemctl start kucafe-runner-watchdog.timer; fi; exit 1; }
rollback_on_error() {
  systemctl disable --now kucafe-runner-watchdog.timer >/dev/null 2>&1 || true
  tar -xzf "$backup_dir/previous-source.tgz" -C /opt/kucafe-autonomy
  install -m 0644 "$backup_dir/previous.service" /etc/systemd/system/kucafe-autonomy.service
  install -m 0644 "$backup_dir/previous.timer" /etc/systemd/system/kucafe-autonomy.timer
  if [[ -f "$backup_dir/previous-maintenance.service" ]]; then install -m 0644 "$backup_dir/previous-maintenance.service" /etc/systemd/system/kucafe-autonomy-maintenance.service; fi
  if [[ -f "$backup_dir/previous-runner-watchdog.service" ]]; then install -m 0644 "$backup_dir/previous-runner-watchdog.service" /etc/systemd/system/kucafe-runner-watchdog.service; else rm -f /etc/systemd/system/kucafe-runner-watchdog.service; fi
  if [[ -f "$backup_dir/previous-runner-watchdog.timer" ]]; then install -m 0644 "$backup_dir/previous-runner-watchdog.timer" /etc/systemd/system/kucafe-runner-watchdog.timer; else rm -f /etc/systemd/system/kucafe-runner-watchdog.timer; fi
  systemctl daemon-reload
  systemctl start kucafe-autonomy.timer
  if [[ "$watchdog_was_active" == active ]]; then systemctl enable --now kucafe-runner-watchdog.timer; fi
  echo 'Upgrade failed; previous source/units restored, checkpoints retained' >&2
}
trap rollback_on_error ERR
git -C "$source_repo" archive "$revision" scripts/autonomy docs/KUCAFE_AUTONOMY_FA.md docs/research/KUCAFE_EXPERIENCE_BATCH_01_20261007.json | tar -x -C /opt/kucafe-autonomy
node --test /opt/kucafe-autonomy/scripts/autonomy/*.test.mjs
systemd-analyze verify /opt/kucafe-autonomy/scripts/autonomy/kucafe-autonomy*.service /opt/kucafe-autonomy/scripts/autonomy/kucafe-autonomy.timer /opt/kucafe-autonomy/scripts/autonomy/kucafe-runner-watchdog.service /opt/kucafe-autonomy/scripts/autonomy/kucafe-runner-watchdog.timer
install -m 0644 /opt/kucafe-autonomy/scripts/autonomy/kucafe-autonomy-maintenance.service /etc/systemd/system/kucafe-autonomy-maintenance.service
install -m 0644 /opt/kucafe-autonomy/scripts/autonomy/kucafe-autonomy.service /etc/systemd/system/kucafe-autonomy.service
install -m 0644 /opt/kucafe-autonomy/scripts/autonomy/kucafe-autonomy.timer /etc/systemd/system/kucafe-autonomy.timer
install -m 0644 /opt/kucafe-autonomy/scripts/autonomy/kucafe-runner-watchdog.service /etc/systemd/system/kucafe-runner-watchdog.service
install -m 0644 /opt/kucafe-autonomy/scripts/autonomy/kucafe-runner-watchdog.timer /etc/systemd/system/kucafe-runner-watchdog.timer
printf '%s\n' "$revision" > "$backup_dir/installed-revision"
systemctl daemon-reload
systemctl enable --now kucafe-autonomy.timer
systemctl enable --now kucafe-runner-watchdog.timer
node /opt/kucafe-autonomy/scripts/autonomy/orchestrator.mjs publish
trap - ERR
echo "Upgraded $revision; rollback snapshot $backup_dir"
