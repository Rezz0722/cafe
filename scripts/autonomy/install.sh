#!/usr/bin/env bash
# Operator installation only, from exact protected GitHub SHA. Never executes model output.
set -Eeuo pipefail
source_repo="${KUCAFE_AUTONOMY_SOURCE_REPO:-/opt/kucafe-phase3-evidence}"
revision="${1:?Pass the exact green-CI protected production SHA}"
[[ "$revision" =~ ^[a-f0-9]{40}$ ]] || { echo 'Invalid SHA' >&2; exit 1; }
[[ "$EUID" == 0 ]] || { echo 'Root operator installation required' >&2; exit 1; }
for tool in node codex git gh curl zip flock systemctl docker pgrep; do command -v "$tool" >/dev/null; done
git -C "$source_repo" fetch origin production
[[ "$(git -C "$source_repo" rev-parse origin/production)" == "$revision" ]] || { echo 'Not current protected production SHA' >&2; exit 1; }
[[ ! -e /opt/kucafe-autonomy ]] || { echo 'Existing installation: stop/review upgrade explicitly' >&2; exit 1; }
[[ ! -e /etc/systemd/system/kucafe-autonomy.service && ! -e /etc/systemd/system/kucafe-autonomy.timer && ! -e /etc/systemd/system/kucafe-autonomy-inbox.path && ! -e /etc/systemd/system/kucafe-autonomy-maintenance.service && ! -e /etc/systemd/system/kucafe-runner-watchdog.service && ! -e /etc/systemd/system/kucafe-runner-watchdog.timer ]] || { echo 'Existing units: review before replacement' >&2; exit 1; }
codex login status
install -d -m 0755 /opt/kucafe-autonomy /var/www/html/kucafe-autonomy
install -d -m 0700 /var/lib/kucafe-autonomy
git -C "$source_repo" archive "$revision" scripts/autonomy docs/KUCAFE_AUTONOMY_FA.md docs/research/KUCAFE_EXPERIENCE_BATCH_01_20261007.json | tar -x -C /opt/kucafe-autonomy
git -C /opt/kucafe-autonomy init -q
node --test /opt/kucafe-autonomy/scripts/autonomy/policy.test.mjs
systemd-analyze verify /opt/kucafe-autonomy/scripts/autonomy/kucafe-autonomy*.service /opt/kucafe-autonomy/scripts/autonomy/kucafe-autonomy.timer /opt/kucafe-autonomy/scripts/autonomy/kucafe-autonomy-inbox.path /opt/kucafe-autonomy/scripts/autonomy/kucafe-runner-watchdog.service /opt/kucafe-autonomy/scripts/autonomy/kucafe-runner-watchdog.timer
install -m 0644 /opt/kucafe-autonomy/scripts/autonomy/kucafe-autonomy-maintenance.service /etc/systemd/system/kucafe-autonomy-maintenance.service
install -m 0644 /opt/kucafe-autonomy/scripts/autonomy/kucafe-autonomy.service /etc/systemd/system/kucafe-autonomy.service
install -m 0644 /opt/kucafe-autonomy/scripts/autonomy/kucafe-autonomy.timer /etc/systemd/system/kucafe-autonomy.timer
install -m 0644 /opt/kucafe-autonomy/scripts/autonomy/kucafe-autonomy-inbox.path /etc/systemd/system/kucafe-autonomy-inbox.path
install -m 0644 /opt/kucafe-autonomy/scripts/autonomy/kucafe-runner-watchdog.service /etc/systemd/system/kucafe-runner-watchdog.service
install -m 0644 /opt/kucafe-autonomy/scripts/autonomy/kucafe-runner-watchdog.timer /etc/systemd/system/kucafe-runner-watchdog.timer
systemctl daemon-reload
# Initial pause publishes secret-safe status, then clears the persisted pause under the same lock.
flock /var/lib/kucafe-autonomy/run.lock node /opt/kucafe-autonomy/scripts/autonomy/supervisor.mjs pause
flock /var/lib/kucafe-autonomy/run.lock node /opt/kucafe-autonomy/scripts/autonomy/supervisor.mjs resume
systemctl enable --now kucafe-autonomy.timer
systemctl enable --now kucafe-autonomy-inbox.path
systemctl enable --now kucafe-runner-watchdog.timer
echo "Installed exact protected SHA $revision. Verify real service/timer/status independently."
