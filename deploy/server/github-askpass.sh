#!/usr/bin/env bash
# Git reads the short-lived bootstrap token through askpass, so it never
# appears in a remote URL, process argument, Git config or shell history.
set -euo pipefail
token_file="${KUCAFE_GITHUB_TOKEN_FILE:-/root/.github-kucafe-token}"
case "${1:-}" in
  *Username*) printf '%s\n' 'x-access-token' ;;
  *Password*) [[ -r "$token_file" ]] && sed -n '1p' "$token_file" ;;
  *) exit 1 ;;
esac
