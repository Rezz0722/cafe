# TopMenuMarket sync — production runbook

The admin endpoint only queues a job. `topmenu-worker` (the maintenance image)
owns execution; the web image does not contain Python or scraper scripts.
State and per-run logs live at `/var/lib/kucafe/topmenu-sync` on the host and
are mounted into both containers. Only an admin may start a scrape or confirm
an apply. There is intentionally no unattended price import.

## Check the service

Run `KUCAFE_ENV_FILE=/opt/kucafe/.env.local docker compose -f /opt/kucafe/compose.yaml ps`
from `/opt/kucafe`; both `app` and `topmenu-worker` should be healthy. Use
`docker compose ... logs --tail=100 topmenu-worker` for process errors and the
admin panel's live progress/report for individual source failures. The worker
heartbeat must be newer than one minute. The same state volume survives image
replacement, but an interrupted in-progress job is marked failed rather than
automatically replayed — especially important for an apply operation.
The admin API refuses to queue a new job when the heartbeat is missing or stale.

## Source failures and data safety

TopMenuMarket currently returns HTTP 403 with a JSON message saying a provider
has no digital menu for some listed providers. This is source-side availability,
not evidence that KuCafe has an empty menu. The scraper records the source
message in `failed_*.json` and the admin report counts failures. Apply refuses
any failed provider in the chosen scope, before backup or database writes.
After reviewing the report, an admin may choose only successfully fetched
providers or rescrape later. Never relabel a failed response as a valid empty
menu, bypass the source's access controls, or assume a 403 is a rate limit.

Before an apply, the worker writes a separate backup under
`/var/backups/kucafe/topmenu-sync`. The deploy script keeps the current and
previous app/maintenance images for rollback. The worker runs as root inside
its container only because the existing image tree is root-owned; it has no
Docker socket, all capabilities except file ownership/access are dropped, and
privilege escalation is disabled. Shared state snapshots are chowned to the web UID 10001. The deploy
script prepares only its two dedicated writable directories.
