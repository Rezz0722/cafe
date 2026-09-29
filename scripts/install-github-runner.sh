#!/usr/bin/env bash
# One-time root-only provisioning. Obtain the short-lived token from:
# GitHub repository -> Settings -> Actions -> Runners -> New self-hosted runner.
set -Eeuo pipefail

[[ "${EUID:-$(id -u)}" == 0 ]] || { echo 'Run as root.' >&2; exit 1; }
token="${GITHUB_RUNNER_TOKEN:-}"
[[ -n "$token" ]] || { echo 'Set the one-hour GITHUB_RUNNER_TOKEN first.' >&2; exit 2; }

version="2.337.0"
sha256="70920811a4f8ad4328818682bca5c6469c1c942fab52448868071d0063816613"
repo_url="${GITHUB_REPOSITORY_URL:-https://github.com/Rezz0722/cafe}"
runner_user="github-runner-kucafe"
runner_dir="/opt/actions-runner-kucafe"
archive="/tmp/actions-runner-linux-x64-${version}.tar.gz"

id "$runner_user" >/dev/null 2>&1 || useradd --system --create-home --shell /bin/bash "$runner_user"
install -d -o "$runner_user" -g "$runner_user" "$runner_dir" /var/lib/kucafe /var/backups/kucafe/db /var/backups/kucafe/media
curl --fail --location --proto '=https' --tlsv1.2 \
  "https://github.com/actions/runner/releases/download/v${version}/actions-runner-linux-x64-${version}.tar.gz" \
  -o "$archive"
echo "$sha256  $archive" | sha256sum --check --status
tar -xzf "$archive" -C "$runner_dir"
rm -f "$archive"
chown -R "$runner_user:$runner_user" "$runner_dir"

sudo -u "$runner_user" "$runner_dir/config.sh" --unattended --replace \
  --url "$repo_url" --token "$token" --name "kucafe-production-$(hostname -s)" \
  --labels kucafe-production --work _work
"$runner_dir/svc.sh" install "$runner_user"
"$runner_dir/svc.sh" start
install -o root -g root -m 0755 /opt/kucafe/deploy/server/kucafe-deploy-wrapper /usr/local/sbin/kucafe-deploy
cat >/etc/sudoers.d/kucafe-github-runner <<EOF
$runner_user ALL=(root) NOPASSWD: /usr/local/sbin/kucafe-deploy [0-9a-f]*
EOF
chmod 0440 /etc/sudoers.d/kucafe-github-runner
visudo -cf /etc/sudoers.d/kucafe-github-runner >/dev/null
echo 'Runner registered. Delete the token from shell history/environment now.'
