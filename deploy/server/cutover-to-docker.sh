#!/usr/bin/env bash
# One-time Apache cutover from legacy PM2 :3000 to Docker :3100.
# The active config is backed up and restored automatically if syntax, KuCafe,
# or any known sibling virtual host regresses.
set -Eeuo pipefail

[[ "${EUID:-$(id -u)}" == 0 ]] || { echo 'Run as root.' >&2; exit 1; }
curl -fsS --max-time 10 http://127.0.0.1:3100/robots.txt >/dev/null || {
  echo 'Docker application is not healthy on 127.0.0.1:3100.' >&2
  exit 1
}

configs=(/etc/httpd/conf/extra/kucafe.conf /etc/httpd/conf/extra/kucafe-tls.conf)
for config in "${configs[@]}"; do [[ -f "$config" ]] || { echo "Missing $config" >&2; exit 1; }; done
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="/var/backups/kucafe/apache-$stamp"
mkdir -p "$backup_dir"
for config in "${configs[@]}"; do cp -a "$config" "$backup_dir/$(basename "$config")"; done

domains=(pakerino.ir greensmoke.ir coco.pakerino.ir agent.pakerino.ir)
declare -A before
probe_http() { curl -sS -o /dev/null -w '%{http_code}' --max-time 12 -H "Host: $1" http://127.0.0.1/ 2>/dev/null || printf 000; }
for domain in "${domains[@]}"; do before[$domain]="$(probe_http "$domain")"; done

restore() {
  for config in "${configs[@]}"; do cp -a "$backup_dir/$(basename "$config")" "$config"; done
  httpd -t && systemctl reload httpd
}
trap 'echo "Cutover failed; restoring Apache configuration." >&2; restore' ERR

for config in "${configs[@]}"; do
  sed -i -E \
    -e '/^[[:space:]]*Alias \/(map|fonts|maplibre|_next\/static)\//d' \
    -e '/^[[:space:]]*ProxyPass \/(map|fonts|maplibre|_next\/static)\//d' \
    -e '/^[[:space:]]*ProxyPass \/(cafe-photo\.webp|logo-sm\.webp|logo\.png|favicon\.svg)[[:space:]]+!/d' \
    -e 's#127\.0\.0\.1:3000#127.0.0.1:3100#g' \
    "$config"
done

httpd -t
systemctl reload httpd
sleep 3
curl -fsS --max-time 15 https://kucafe.ir/robots.txt >/dev/null
curl -fsS --max-time 15 https://kucafe.ir/manifest.webmanifest >/dev/null
for domain in "${domains[@]}"; do
  after="$(probe_http "$domain")"
  if [[ "${before[$domain]}" == 200 && "$after" != 200 ]]; then
    echo "$domain regressed from 200 to $after" >&2
    false
  fi
done

trap - ERR
echo "Apache now proxies KuCafe to Docker :3100. Backup: $backup_dir"
echo 'Keep PM2 available until a full external smoke is approved; then retire it manually.'
