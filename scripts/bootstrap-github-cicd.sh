#!/usr/bin/env bash
# One-time GitHub bootstrap. It intentionally stops at an open PR: the initial
# 491-file production baseline must still pass GitHub CI before the owner merges
# it. The merge itself triggers the already-installed production runner.
set -Eeuo pipefail

[[ "${EUID:-$(id -u)}" == 0 ]] || { echo 'Run as root.' >&2; exit 1; }
project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
token_file="${KUCAFE_GITHUB_TOKEN_FILE:-/root/.github-kucafe-token}"
owner="${KUCAFE_GITHUB_OWNER:-Rezz0722}"
repository="${KUCAFE_GITHUB_REPOSITORY:-cafe}"
feature_branch="ops/docker-github-cicd"
production_branch="production"

[[ -s "$token_file" ]] || { echo "Missing token file: $token_file" >&2; exit 2; }
mode="$(stat -c '%a' "$token_file")"
[[ "$mode" == 600 || "$mode" == 400 ]] || { echo 'Token file mode must be 600 or 400.' >&2; exit 2; }
[[ "$(stat -c '%U:%G' "$token_file")" == root:root ]] || { echo 'Token file must be owned by root:root.' >&2; exit 2; }
[[ "$(git -C "$project_dir" branch --show-current)" == "$feature_branch" ]] || {
  echo "Expected branch $feature_branch." >&2; exit 1;
}
[[ -z "$(git -C "$project_dir" status --porcelain)" ]] || { echo 'Worktree must be clean.' >&2; exit 1; }

token="$(sed -n '1p' "$token_file")"
[[ -n "$token" ]] || { echo 'Token file is empty.' >&2; exit 2; }
api_base="https://api.github.com/repos/$owner/$repository"

api() {
  local method="$1" path="$2" data="${3:-}"
  local args=(--silent --show-error --fail-with-body --request "$method"
    --header 'Accept: application/vnd.github+json'
    --header 'X-GitHub-Api-Version: 2022-11-28')
  [[ -z "$data" ]] || args+=(--header 'Content-Type: application/json' --data-binary "$data")
  curl --config <(printf 'header = "Authorization: Bearer %s"\n' "$token") \
    "${args[@]}" "$api_base$path"
}

echo 'Validating GitHub repository administration access.'
repo_json="$(api GET '')"
permission="$(node -e "const j=JSON.parse(process.argv[1]);process.stdout.write(j.permissions?.admin?'admin':'insufficient')" "$repo_json")"
[[ "$permission" == admin ]] || { echo 'Token does not have repository administration access.' >&2; exit 1; }

export KUCAFE_GITHUB_TOKEN_FILE="$token_file"
export GIT_ASKPASS="$project_dir/deploy/server/github-askpass.sh"
export GIT_TERMINAL_PROMPT=0
git -C "$project_dir" push --set-upstream origin "$feature_branch"

# Create the deployment environment before the runner exists. Deployment is
# restricted to protected branches; there is no manual approval in the normal
# path because CI + protected production is the release gate.
api PUT /environments/production \
  '{"deployment_branch_policy":{"protected_branches":true,"custom_branch_policies":false}}' >/dev/null

production_sha="$(git ls-remote origin "refs/heads/$production_branch" | awk '{print $1}')"
if [[ -z "$production_sha" ]]; then
  base_sha="$(git ls-remote origin refs/heads/feat/nextjs-data-platform | awk '{print $1}')"
  [[ -n "$base_sha" ]] || base_sha="$(git ls-remote origin HEAD | awk '{print $1}')"
  [[ -n "$base_sha" ]] || { echo 'Could not resolve a bootstrap base SHA.' >&2; exit 1; }
  api POST /git/refs "{\"ref\":\"refs/heads/$production_branch\",\"sha\":\"$base_sha\"}" >/dev/null
fi

protection='{"required_status_checks":{"strict":true,"contexts":["verify"]},"enforce_admins":true,"required_pull_request_reviews":{"dismiss_stale_reviews":true,"require_code_owner_reviews":false,"required_approving_review_count":0},"restrictions":null,"required_conversation_resolution":true,"allow_force_pushes":false,"allow_deletions":false}'
api PUT "/branches/$production_branch/protection" "$protection" >/dev/null
api PATCH '' "{\"default_branch\":\"$production_branch\"}" >/dev/null

existing_pr="$(api GET "/pulls?state=open&base=$production_branch&head=$owner:$feature_branch")"
pr_count="$(node -e 'process.stdout.write(String(JSON.parse(process.argv[1]).length))' "$existing_pr")"
if [[ "$pr_count" == 0 ]]; then
  pr_body='{"title":"Dockerize KuCafe and establish protected GitHub delivery","head":"ops/docker-github-cicd","base":"production","body":"Production baseline plus Docker Compose, CI, self-hosted deployment, backup, retention and rollback. Merge only after the required verify check is green."}'
  pr_json="$(api POST /pulls "$pr_body")"
else
  pr_json="$(node -e 'process.stdout.write(JSON.stringify(JSON.parse(process.argv[1])[0]))' "$existing_pr")"
fi
pr_url="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).html_url)' "$pr_json")"

runner_json="$(api POST /actions/runners/registration-token)"
runner_token="$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).token))' <<<"$runner_json")"
[[ -n "$runner_token" ]] || { echo 'GitHub did not return a runner registration token.' >&2; exit 1; }
GITHUB_RUNNER_TOKEN="$runner_token" bash "$project_dir/scripts/install-github-runner.sh"
unset runner_token token

# The PAT is not needed by the runner or future deployments.
shred -u -- "$token_file"
echo "GitHub bootstrap complete. Pull request: $pr_url"
echo 'Merge it only after the required verify check succeeds; deployment then starts automatically.'
