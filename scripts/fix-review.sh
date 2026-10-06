#!/usr/bin/env bash
set -Eeuo pipefail

# ==============================================================================
# Configuration
# ==============================================================================

REVIEW="docs/reviews/2026-10-04-solar-calcule-review.md"
BRANCH="fix/review-2026-10-04"
BASE="main"
MAX="${MAX_FINDINGS:-20}"
CREATE_PR="${CREATE_PR:-true}"

# ==============================================================================
# Helpers
# ==============================================================================

die() {
    echo >&2
    echo "ERROR: $*" >&2
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
    grep -c '^- \[ \]' "$REVIEW" || true
}

# ==============================================================================
# Requirements
# ==============================================================================

for cmd in git grep sed cut cmp mktemp codex tr; do
    require_command "$cmd"
done

[[ "$MAX" =~ ^[1-9][0-9]*$ ]] || die "MAX_FINDINGS must be a positive integer"
[[ "$CREATE_PR" == "true" || "$CREATE_PR" == "false" ]] || die "CREATE_PR must be true or false"

# ==============================================================================
# Locate repository
# ==============================================================================

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null)" \
    || die "This script must be located inside a Git repository"

cd "$REPO_ROOT"

# ==============================================================================
# Hardened Codex execution boundary
# ==============================================================================
#
# The Bash wrapper keeps normal host network access for git fetch/push and gh.
# The Codex child gets a separate restrictive execution policy:
#   - workspace-write filesystem sandbox;
#   - no outbound network from agent-executed shell commands;
#   - no approval/escalation path;
#   - no hosted web search;
#   - no apps/connectors/plugins/hooks/multi-agent tooling;
#   - no user/project Codex config or exec-policy rules for the child;
#   - ephemeral session;
#   - reduced shell environment inheritance.
#
# The Codex CLI itself may still contact its configured model provider. A fully
# offline run requires a local model/provider as well.

source "$SCRIPT_DIR/codex-runner.sh"
preflight_codex

# ==============================================================================
# Validate starting state
# ==============================================================================

[[ -f "$REVIEW" ]] || die "Review file not found: $REVIEW"
git ls-files --error-unmatch "$REVIEW" >/dev/null 2>&1 \
    || die "Review file is not tracked by Git: $REVIEW"

ensure_clean_worktree "before branch preparation"

# ==============================================================================
# Prepare branch
# ==============================================================================

echo "Fetching origin..."
git fetch origin --prune

git show-ref --verify --quiet "refs/remotes/origin/$BASE" \
    || die "Remote base branch origin/$BASE does not exist"

if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
    echo "Using existing local branch: $BRANCH"
    git switch "$BRANCH"
    ensure_clean_worktree "after switching to $BRANCH"

    if git show-ref --verify --quiet "refs/remotes/origin/$BRANCH"; then
        if git merge-base --is-ancestor "$BRANCH" "origin/$BRANCH"; then
            git merge --ff-only "origin/$BRANCH"
        elif git merge-base --is-ancestor "origin/$BRANCH" "$BRANCH"; then
            git push -u origin "$BRANCH"
        else
            die "$BRANCH and origin/$BRANCH have diverged; resolve manually"
        fi
    fi
elif git show-ref --verify --quiet "refs/remotes/origin/$BRANCH"; then
    git switch --track -c "$BRANCH" "origin/$BRANCH"
else
    git switch -c "$BRANCH" "origin/$BASE"
fi

ensure_clean_worktree "before review processing"
[[ "$(git branch --show-current)" == "$BRANCH" ]] || die "Failed to activate $BRANCH"

if ! git merge-base --is-ancestor "origin/$BASE" "$BRANCH"; then
    die "$BRANCH does not contain current origin/$BASE; rebase manually before continuing"
fi

TMP_DIR="$(mktemp -d)"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

# ==============================================================================
# Fix one finding at a time
# ==============================================================================

i=0

while (( i < MAX )); do
    before="$(count_unchecked)"
    (( before == 0 )) && break

    i=$((i + 1))

    target_line="$(grep -n -m1 '^- \[ \]' "$REVIEW" | cut -d: -f1)"
    [[ -n "$target_line" ]] || die "Could not determine first unchecked review line"

    original_line="$(sed -n "${target_line}p" "$REVIEW")"
    finding="${original_line#- [ ] }"
    [[ -n "$finding" ]] || die "Could not extract review finding from line $target_line"

    echo
    echo "=============================================================================="
    echo "Finding $i / $MAX"
    echo "=============================================================================="
    echo "Review:  $REVIEW:$target_line"
    echo "Finding: $finding"
    echo

    ensure_clean_worktree "before Codex finding $i"

    cp "$REVIEW" "$TMP_DIR/review-expected.md"
    sed -i "${target_line}s/^- \[ \]/- [x]/" "$TMP_DIR/review-expected.md"

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
Do not mark any other finding complete.
Do not perform unrelated refactoring, cleanup, formatting, renaming, dependency upgrades, architectural changes, or feature work.

NETWORK / EXTERNAL-TOOL POLICY
Do not use web search, browser tools, apps/connectors, plugins, MCP tools, curl, wget,
network package installation, remote APIs, or any command requiring outbound network access.
Use only repository files, already-installed local tooling, and local tests.

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

    if ! run_codex_safely "$prompt"; then
        die "Codex failed; working tree preserved for inspection"
    fi

    [[ "$(git branch --show-current)" == "$branch_before" ]] || die "Codex changed branches"
    [[ "$(git rev-parse HEAD)" == "$head_before" ]] || die "Codex changed Git history"
    git diff --cached --quiet || die "Codex staged files"

    if ! cmp -s "$REVIEW" "$TMP_DIR/review-expected.md"; then
        git diff -- "$REVIEW" || true
        die "Review document changed unexpectedly; only the assigned [ ] -> [x] transition is allowed"
    fi

    after="$(count_unchecked)"
    expected=$((before - 1))
    (( after == expected )) || die "Unchecked count changed unexpectedly: $before -> $after (expected $expected)"

    git diff --check || die "git diff --check failed"

    changed_outside_review="$({ git diff --name-only; git ls-files --others --exclude-standard; } | sort -u | grep -Fvx -- "$REVIEW" || true)"
    if [[ -z "$changed_outside_review" ]]; then
        echo "Finding was already fixed and verified; only review status changed."
        commit_prefix="docs"
    else
        echo "Changed files:"
        printf '%s\n' "$changed_outside_review" | sed 's/^/  /'
        commit_prefix="fix"
    fi

    git add -A
    git diff --cached --check || die "Staged diff validation failed"

    short_finding="$(printf '%s' "$finding" | tr '\n' ' ' | tr -s ' ' | cut -c1-68)"
    git commit -m "$commit_prefix: $short_finding"
    git push -u origin "$BRANCH"
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
git push -u origin "$BRANCH"

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

gh pr create \
    --base "$BASE" \
    --head "$BRANCH" \
    --title "Fixes from review 2026-10-04" \
    --body "Automated one-by-one fixes for findings in \`$REVIEW\`. Codex runs locally with workspace writes allowed but agent-command network access and external integration tools disabled; the Bash wrapper owns commits, pushes, and PR creation."

echo "Done."
