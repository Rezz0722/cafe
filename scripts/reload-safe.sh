#!/usr/bin/env bash
# Reload only this web server, preserve detached jobs, and retire old proxy peers.
set -euo pipefail
project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"
if [[ $# -gt 1 || (${1:-} != '' && ${1:-} != '--check') ]]; then
  echo 'Usage: bash scripts/reload-safe.sh [--check]' >&2
  exit 2
fi
old_pid="$(pm2 pid kucafe)"
if [[ ! "$old_pid" =~ ^[0-9]+$ || "$old_pid" -le 1 || ! -d "/proc/$old_pid" ]]; then
  echo 'A running single kucafe process is required.' >&2
  exit 1
fi
if [[ "$(readlink "/proc/$old_pid/cwd")" != "$project_dir" ]]; then
  echo 'Refusing reload: PM2 app CWD does not match this project.' >&2
  exit 1
fi
old_started="$(ps -p "$old_pid" -o lstart=)"
if [[ ${1:-} == '--check' ]]; then
  echo "Verified kucafe web process $old_pid in $project_dir; no reload performed."
  exit 0
fi
pm2 reload ecosystem.config.cjs --env production
new_pid="$(pm2 pid kucafe)"
if [[ ! "$new_pid" =~ ^[0-9]+$ || "$new_pid" -le 1 || "$new_pid" == "$old_pid" ]]; then
  echo 'Reload did not create a new process; no PID cleanup attempted.' >&2
  exit 1
fi
if [[ "$(readlink "/proc/$new_pid/cwd")" != "$project_dir" ]]; then
  echo 'New process has an unexpected CWD; no PID cleanup attempted.' >&2
  exit 1
fi
same_old_instance() {
  kill -0 "$old_pid" 2>/dev/null &&
    [[ "$(ps -p "$old_pid" -o lstart=)" == "$old_started" ]] &&
    [[ "$(readlink "/proc/$old_pid/cwd")" == "$project_dir" ]] &&
    [[ "$(pm2 pid kucafe)" != "$old_pid" ]]
}
# Some PM2 versions retain a stale _tree_pids snapshot when tree-kill is disabled.
# An old server can otherwise retain Apache keep-alive peers after reload.
if same_old_instance; then
  kill -TERM "$old_pid" 2>/dev/null || true
  for attempt in {1..10}; do
    if ! same_old_instance; then break; fi
    sleep 1
  done
  if same_old_instance; then
    # Exact retired PID only: never signal the scrape/apply descendants.
    kill -KILL "$old_pid"
    echo "Retired previous web process $old_pid after its shutdown grace period."
  fi
fi
if [[ "$(pm2 pid kucafe)" != "$new_pid" ]]; then
  echo 'PM2 no longer tracks the new process; inspect its state before retrying.' >&2
  exit 1
fi
for attempt in {1..20}; do
  status="$(curl -sS --max-time 2 -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/manifest.webmanifest 2>/dev/null || true)"
  if [[ "$status" == '200' ]]; then
    echo "KuCafe web process $new_pid is ready; detached jobs were not signalled."
    exit 0
  fi
  sleep 1
done
echo 'New web process did not become ready; inspect PM2 logs before retrying.' >&2
exit 1
