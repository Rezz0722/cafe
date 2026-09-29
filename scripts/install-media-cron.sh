#!/usr/bin/env bash
set -euo pipefail
[[ "${EUID:-$(id -u)}" == 0 ]] || { echo 'Run as root.' >&2; exit 1; }
project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
install -d -m 0755 /var/log/kucafe
install -m 0644 "$project_dir/deploy/cron/kucafe-media" /etc/cron.d/kucafe-media
echo 'Installed /etc/cron.d/kucafe-media (daily at 03:20 Asia/Tehran).'
