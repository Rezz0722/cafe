# Private application evidence across Docker deployments

Compose replacement removes the previous container and its Docker logs. This
prevented historical 500/502 investigations from recovering old application
stacks. Before replacement, `docker-deploy.sh` now archives the exact existing
KuCafe application container identified by Compose and verified by project labels.

- Location: `/var/backups/kucafe/app-logs` (0700), gzip files (0600).
- Bounds: last 24 hours, last 20,000 lines, latest five successful archives.
- Header records image, revision, start time, OOM flag and restart count only.
- No environment, database dump, user/session inspection or public publishing.
- Logs may contain sensitive exception details. Never attach these files to
  public reports, GitHub, or `/var/www/html` without separate sanitization.
- A failed capture refuses replacement and does not publish a partial archive.
- Initial deployment with no previous app skips capture.
- This is bounded pre-deploy evidence, not continuous/off-site monitoring and not
  a fix for upstream resets, HTTP 5xx, hydration or zero-downtime deployment.

Rollback: revert the archive call through a protected-branch PR if it obstructs
deployments; existing private archives may remain. No Apache/DB change is made.
