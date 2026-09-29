#!/usr/bin/env bash
set -euo pipefail
[[ "${EUID:-$(id -u)}" == 0 ]] || { echo 'Run as root.' >&2; exit 1; }
install -d -m 0755 /var/log/kucafe
install -m 0644 deploy/cron/kucafe-media /etc/cron.d/kucafe-media
echo 'Installed /etc/cron.d/kucafe-media (daily at 03:20 Asia/Tehran).'
