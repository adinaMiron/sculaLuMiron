#!/usr/bin/env bash
# This entire bootstrap is parsed before execution; no agent runs until exec.
{
    runner_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
    exec python3 -I "$runner_dir/trusted-runner.py" "$runner_dir/$(basename -- "${BASH_SOURCE[0]}")" "$@"
    exit 1
}
# TRUSTED_RUNNER_BODY
set -Eeuo pipefail

# ==============================================================================
# Configuration
# ==============================================================================

REVIEW="docs/reviews/2026-10-08-index-review.md"
BRANCH="fix/2026-10-08-index-review"
BASE="main"
MAX="${MAX_FINDINGS:-20}"
CREATE_PR="${CREATE_PR:-true}"

# Set your preferred model and effort here, for example "gpt-6.1-sol" and "high".
# Empty defaults use the CLI/model defaults. Environment values take precedence;
# an explicitly empty environment value also restores the CLI/model default.
DEFAULT_CODEX_MODEL="gpt-6.1-sol"
DEFAULT_CODEX_EFFORT="high"
CODEX_MODEL="${CODEX_MODEL-$DEFAULT_CODEX_MODEL}"
CODEX_EFFORT="${CODEX_EFFORT-$DEFAULT_CODEX_EFFORT}"

usage() {
    cat <<'TXT'
Usage:
  ./scripts/fix-review.sh

Example:
  CODEX_MODEL=gpt-6.1-sol CODEX_EFFORT=high ./scripts/fix-review.sh

Optional environment variables:
  MAX_FINDINGS=20
  CREATE_PR=true
  BROWSER_PREFLIGHT=true
  CODEX_REPAIR_ATTEMPTS=2 (additional attempts for an unchecked assignment; 0 disables)
  CODEX_MODEL=<OpenAI model identifier> (unset: script default)
  CODEX_EFFORT=none|minimal|low|medium|high|xhigh|max|ultra (unset: script default)

Edit DEFAULT_CODEX_MODEL and DEFAULT_CODEX_EFFORT in the configuration section.
Environment values override those defaults; empty values use CLI/model defaults.
Choose an effort supported by your model and installed Codex CLI.
Model/effort selections apply to findings and retries.
Incomplete assignments retry with their log and preserved edits, up to the repair cap.
CLI failures and integrity violations stop immediately; usage-limit waits are separate.
Before any Git change, the runner checks that Playwright's bundled headless
Chromium starts inside the Codex sandbox (install it with: cd tests &&
npm install && npx playwright install chromium-headless-shell).
BROWSER_PREFLIGHT=false skips that check for runs without browser tests.
The review document and branch are configured in this script.
Progress is concise; detailed per-finding logs are in .git/automation-logs/
(linked worktrees use their own Git administrative directory).
TXT
}

if (( $# == 1 )) && [[ "$1" == --help || "$1" == -h ]]; then
    usage
    exit 0
fi
(( $# == 0 )) || { usage; exit 2; }

# ==============================================================================
# Helpers
# ==============================================================================

die() {
    echo >&2
    echo "ERROR: $*" >&2
    if declare -F log_error >/dev/null; then log_error "$@"; fi
    exit 1
}

require_command() {
    command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

ensure_clean_worktree() {
    local context="${1:-}"
    if [[ -n "$(git status --porcelain)" ]]; then
        echo
        echo "Working tree is not clean${context:+ ($context)}:"
        git status --short
        echo
        echo "The script will not stash, reset, restore, or discard these changes."
        die "Commit or stash them before continuing."
    fi
}

count_unchecked() {
    [[ -f "$REVIEW" ]] || die "Review file not found: $REVIEW"
    markdown_tasks count "$REVIEW"
}

validate_review_input() {
    count_unchecked >/dev/null || die "Cannot read review file: $REVIEW"
    git ls-files --error-unmatch "$REVIEW" >/dev/null 2>&1 \
        || die "Review file is not tracked by Git: $REVIEW"
}

# ==============================================================================
# Requirements
# ==============================================================================

for cmd in git grep sed cut cmp codex tr timeout; do
    require_command "$cmd"
done

[[ "$MAX" =~ ^[1-9][0-9]*$ ]] || die "MAX_FINDINGS must be a positive integer"
[[ "$CREATE_PR" == "true" || "$CREATE_PR" == "false" ]] || die "CREATE_PR must be true or false"

# ==============================================================================
# Locate repository
# ==============================================================================

# REPO_ROOT is supplied by the sealed trusted launcher.
cd "$REPO_ROOT"

# ==============================================================================
# Hardened Codex execution boundary
# ==============================================================================
#
# The Bash wrapper keeps normal host network access for git fetch/push and gh.
# The Codex child gets a separate restrictive execution policy:
#   - workspace-write filesystem sandbox;
#   - local browser IPC via the enforced network proxy sandbox, with no
#     allowed outbound destinations from agent-executed shell commands;
#   - Chromium and Node bypass that proxy, so their internet requests fail
#     offline instead of terminating the command;
#   - no approval/escalation path;
#   - no hosted web search;
#   - no apps/connectors/plugins/hooks/multi-agent tooling;
#   - no user/project Codex config or exec-policy rules for the child;
#   - ephemeral session;
#   - reduced shell environment inheritance.
#
# The Codex CLI itself may still contact its configured model provider. A fully
# offline run requires a local model/provider as well.

source "/proc/self/fd/$WRAPPER_HELPER_FD"
assert_finding_retry_state() {
    assert_item_retry_state "$REVIEW" "$target_line"
}
preflight_codex
preflight_browser

# ==============================================================================
# Validate starting state
# ==============================================================================

validate_review_input

ensure_clean_worktree "before branch preparation"

# ==============================================================================
# Prepare branch
# ==============================================================================

start_work_log "review-prepare" "Preparing review branch: $BRANCH"
work_status "Fetching origin..."
run_logged git fetch origin --prune

git show-ref --verify --quiet "refs/remotes/origin/$BASE" \
    || die "Remote base branch origin/$BASE does not exist"

if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
    work_status "Using existing local branch: $BRANCH"
    run_logged git switch "$BRANCH"
    ensure_clean_worktree "after switching to $BRANCH"

    if git show-ref --verify --quiet "refs/remotes/origin/$BRANCH"; then
        if git merge-base --is-ancestor "$BRANCH" "origin/$BRANCH"; then
            run_logged git merge --ff-only "origin/$BRANCH"
        elif git merge-base --is-ancestor "origin/$BRANCH" "$BRANCH"; then
            : # Publish only after selected-branch inputs have been validated.
        else
            die "$BRANCH and origin/$BRANCH have diverged; resolve manually"
        fi
    fi
elif git show-ref --verify --quiet "refs/remotes/origin/$BRANCH"; then
    run_logged git switch --track -c "$BRANCH" "origin/$BRANCH"
else
    run_logged git switch -c "$BRANCH" "origin/$BASE"
fi

validate_review_input
ensure_clean_worktree "before review processing"
[[ "$(git branch --show-current)" == "$BRANCH" ]] || die "Failed to activate $BRANCH"

if ! git merge-base --is-ancestor "origin/$BASE" "$BRANCH"; then
    die "$BRANCH does not contain current origin/$BASE; rebase manually before continuing"
fi

# ==============================================================================
# Fix one finding at a time
# ==============================================================================

i=0

while (( i < MAX )); do
    before="$(count_unchecked)"
    (( before == 0 )) && break

    i=$((i + 1))

    target_line="$(markdown_tasks first "$REVIEW")"
    [[ -n "$target_line" ]] || die "Could not determine first unchecked review line"

    original_line="$(sed -n "${target_line}p" "$REVIEW")"
    finding="$(printf '%s\n' "$original_line" | sed -E 's/^ {0,3}- \[ \][[:blank:]]*//')"
    [[ -n "$finding" ]] || die "Could not extract review finding from line $target_line"

    start_work_log "fix-$i" "Finding $i: $before open — $REVIEW:$target_line"
    work_status "Fixing: $(printf '%s' "$finding" | cut -c1-160)"
    printf '\nExact finding:\n%s\n' "$original_line" >> "$WORK_LOG"

    ensure_clean_worktree "before Codex finding $i"

    other_checkboxes="$(build_other_checkbox_manifest "$REVIEW")" || die "Cannot inventory task/review checkboxes"
    seal_validation_evidence \
        <(sed "${target_line}s/- \[ \]/- [x]/" "$REVIEW") \
        <(printf '%s' "$other_checkboxes")

    head_before="$(git rev-parse HEAD)"
    branch_before="$(git branch --show-current)"

    prompt="$(cat <<PROMPT
You are fixing exactly ONE finding from this code review:

$REVIEW

Assigned line: $target_line
Exact finding:
$original_line

Finding text:
$finding

WORKFLOW
1. Read the finding and only the repository context necessary to understand it.
2. Determine whether it is already fixed. If already fixed, verify it with relevant tests rather than rewriting correct code.
3. Otherwise implement the smallest correct fix.
4. Add or update tests when reasonably necessary.
5. Run relevant tests and appropriate regression tests.
6. Inspect the final diff.
7. Only if the finding is genuinely resolved and relevant tests pass, change exactly this line from [ ] to [x]:
$original_line

Do not change the finding wording.
Do not change any other checkbox anywhere under docs/tasks/ or docs/reviews/.
Do not add, remove, or move checkbox tasks or findings during this run, including through document creation/deletion.
Do not perform unrelated refactoring, cleanup, formatting, renaming, dependency upgrades, architectural changes, or feature work.

TEST SELECTION
Review suites can contain failing regression tests for other open findings.
Select the assigned finding's tests by a stable tag/ID or precise test titles,
plus relevant passing regression coverage. Avoid broad keyword filters.
Before running filtered Playwright tests, use the same command with --list and
inspect every selected title; narrow the filter if it includes unrelated findings.
Check the installed runner's matching rules: a plain --grep can ignore case and
match substrings (for example, New can also select a rename test containing new).
If you add tests for this finding, give them a shared @<finding-id> tag when supported.

$CODEX_TEST_GUIDANCE

CONTROL PLANE
Do not modify scripts/, .github/, .githooks/, .gitattributes, or .gitmodules.
The wrapper rejects changes to these paths, including new or ignored files.
Control-plane maintenance requires a separate human-reviewed change.

NETWORK / EXTERNAL-TOOL POLICY
Do not use web search, browser MCP tools, apps/connectors, plugins, MCP tools, curl, wget,
network package installation, remote APIs, or any command requiring outbound network access.
Use only repository files, already-installed local tooling, and local tests.
Local Playwright tests are required where relevant; see the next section.

$CODEX_SANDBOX_GUIDANCE

GIT OWNERSHIP
The Bash wrapper owns Git history and remote operations.
Do NOT run git add, commit, push, checkout, switch, merge, rebase, reset, restore,
stash, cherry-pick, or gh PR commands.
Read-only git status/diff/log/show commands are allowed.

FAILURE
If the finding cannot be completed safely, leave it unchecked, preserve useful diagnostic work, explain the blocker, and stop.

SUCCESS
Leave implementation/tests/documentation changes unstaged, leave exactly this finding marked [x], and stop.
PROMPT
)"

    if ! run_codex_with_assignment_repair assert_finding_retry_state "$REVIEW" "$prompt"; then
        die "Codex failed; working tree preserved for inspection"
    fi

    work_status "Validating finding and changes..."
    [[ "$(git branch --show-current)" == "$branch_before" ]] || die "Codex changed branches"
    [[ "$(git rev-parse HEAD)" == "$head_before" ]] || die "Codex changed Git history"
    git diff --cached --quiet || die "Codex staged files"

    if ! cmp -s "$REVIEW" "${EVIDENCE_PATHS[0]}"; then
        if sed "${target_line}s/- \[x\]/- [ ]/" "${EVIDENCE_PATHS[0]}" | cmp -s "$REVIEW" -; then
            check_other_checkboxes "$REVIEW"
            die "Assigned finding is still unchecked; implementation or verification is incomplete. See the agent summary in the log; working tree preserved for inspection"
        fi
        git diff -- "$REVIEW" >> "$WORK_LOG" 2>&1 || true
        die "Review document changed unexpectedly; only the assigned [ ] -> [x] transition is allowed"
    fi

    check_other_checkboxes "$REVIEW"

    after="$(count_unchecked)"
    expected=$((before - 1))
    (( after == expected )) || die "Unchecked count changed unexpectedly: $before -> $after (expected $expected)"

    release_validation_evidence || die "Validation evidence holder failed"

    run_logged git diff --check

    changed_outside_review="$({ git diff --name-only; git ls-files --others --exclude-standard; } | sort -u | grep -Fvx -- "$REVIEW" || true)"
    if [[ -z "$changed_outside_review" ]]; then
        work_status "Finding was already fixed and verified; only review status changed."
        commit_prefix="docs"
    else
        printf '\nChanged files:\n%s\n' "$changed_outside_review" >> "$WORK_LOG"
        commit_prefix="fix"
    fi

    work_status "Committing and pushing finding $i..."
    run_logged git add -A
    run_logged git diff --cached --check

    short_finding="$(printf '%s' "$finding" | tr '\n' ' ' | tr -s ' ' | cut -c1-68)"
    run_logged git commit -m "$commit_prefix: $short_finding"
    run_logged git push -u origin "$BRANCH"
    work_status "Completed finding $i — committed $(git rev-parse --short HEAD) and pushed."
done

# ==============================================================================
# End state / PR
# ==============================================================================

remaining="$(count_unchecked)"
if (( remaining > 0 )); then
    echo
    echo "Stopped after $i finding(s); $remaining unchecked finding(s) remain."
    echo "Completed work is already committed and pushed."
    exit 0
fi

ensure_clean_worktree "after completing all findings"
run_logged git push -u origin "$BRANCH"

echo
echo "All review findings are complete."

[[ "$CREATE_PR" == "true" ]] || { echo "CREATE_PR=false — stopping after push."; exit 0; }

require_command gh
gh auth status >/dev/null 2>&1 || die "GitHub CLI is not authenticated; run: gh auth login"

existing_pr="$(gh pr list --head "$BRANCH" --base "$BASE" --state open --json url --jq '.[0].url // empty')"
if [[ -n "$existing_pr" ]]; then
    echo "Pull request already exists: $existing_pr"
    exit 0
fi

commits_ahead="$(git rev-list --count "origin/$BASE..$BRANCH")"
(( commits_ahead > 0 )) || { echo "No commits beyond origin/$BASE; no PR necessary."; exit 0; }

work_status "Creating pull request..."
run_logged gh pr create \
    --base "$BASE" \
    --head "$BRANCH" \
    --title "Fixes from review $(basename "$REVIEW" .md)" \
    --body "Automated one-by-one fixes for findings in \`$REVIEW\`. Codex runs locally with workspace writes allowed but agent-command network access and external integration tools disabled; the Bash wrapper owns commits, pushes, and PR creation."

pr_url="$(tail -n 1 "$WORK_LOG")"
if [[ "$pr_url" =~ ^https://[^[:space:]]+/pull/[0-9]+$ ]]; then
    work_status "Pull request: $pr_url"
else
    work_status "Done. Pull request details: $WORK_LOG"
fi
