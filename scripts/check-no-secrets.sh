#!/usr/bin/env bash
set -euo pipefail

bad=0
while IFS= read -r path; do
  case "$path" in
    .env|.env.local|.env.production|.env.compose|deploy.env|*.pem|*.key)
      echo "Forbidden secret-like tracked file: $path" >&2
      bad=1
      ;;
  esac
done < <(git ls-files)

if git grep -n -I -E -- '-----BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY-----' -- ':!scripts/check-no-secrets.sh' >/dev/null; then
  echo 'A private key marker exists in tracked content.' >&2
  bad=1
fi
exit "$bad"
