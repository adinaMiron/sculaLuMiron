#!/usr/bin/env bash
set -Eeuo pipefail

# ==============================================================================
# Configuration
# ==============================================================================

REVIEW="docs/reviews/2026-10-04-solar-calcule-review.md"
BRANCH="fix/review-2026-10-04"
BASE="main"
MAX=20
TEXTPR="Fixes from review 2026-10-04"

# ==============================================================================
# Helpers
# ==============================================================================

die() {
    echo
    echo "ERROR: $*" >&2
    exit 1
}

require_command() {
    command -v "$1" >/dev/null 2>&1 \
        || die "Required command not found: $1"
}

count_unchecked() {
    grep -c '^- \[ \]' "$REVIEW" || true
}

ensure_clean_worktree() {
    local context="${1:-}"

    if [[ -n "$(git status --porcelain)" ]]; then
        echo
        echo "Working tree is not clean${context:+ ($context)}:"
        echo
        git status --short
        echo
        echo "The script will NOT stash, reset, discard, or overwrite these changes."
        die "Commit, stash, or otherwise resolve them before continuing."
    fi
}

# ==============================================================================
# Locate repository
# ==============================================================================

require_command git
require_command grep
require_command sed
require_command cmp
require_command codex

SCRIPT_DIR="$(
    cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
    pwd -P
)"

REPO_ROOT="$(
    git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null
)" || die "This script must be located inside a Git repository."

cd "$REPO_ROOT"

echo "Repository: $REPO_ROOT"
echo "Review:     $REVIEW"
echo "Base:       $BASE"
echo "Branch:     $BRANCH"
echo

[[ "$MAX" =~ ^[1-9][0-9]*$ ]] \
    || die "MAX must be a positive integer."

# ==============================================================================
# Protect existing local work
# ==============================================================================

ensure_clean_worktree "before branch preparation"

# ==============================================================================
# Refresh remote references
# ==============================================================================

echo "Fetching origin..."
git fetch origin --prune

git show-ref --verify --quiet "refs/remotes/origin/$BASE" \
    || die "Remote base branch origin/$BASE does not exist."

# ==============================================================================
# Prepare working branch
# ==============================================================================

if git show-ref --verify --quiet "refs/heads/$BRANCH"; then

    echo "Using existing local branch: $BRANCH"
    git switch "$BRANCH"

    ensure_clean_worktree "after switching to $BRANCH"

    # If the branch also exists remotely, synchronize conservatively.
    #
    # Allowed:
    #   remote == local
    #   remote ahead -> fast-forward local
    #   local ahead  -> leave local commits intact
    #
    # Not allowed:
    #   divergent histories
    if git show-ref --verify --quiet "refs/remotes/origin/$BRANCH"; then

        if git merge-base --is-ancestor "$BRANCH" "origin/$BRANCH"; then
            echo "Fast-forwarding from origin/$BRANCH if necessary..."
            git merge --ff-only "origin/$BRANCH"

        elif git merge-base --is-ancestor "origin/$BRANCH" "$BRANCH"; then
            echo "Local branch is ahead of origin/$BRANCH; keeping local commits."

        else
            die \
                "$BRANCH and origin/$BRANCH have diverged. Resolve this manually before running the script."
        fi
    fi

elif git show-ref --verify --quiet "refs/remotes/origin/$BRANCH"; then

    echo "Creating local tracking branch from origin/$BRANCH..."
    git switch --track -c "$BRANCH" "origin/$BRANCH"

else

    echo "Creating new branch $BRANCH from origin/$BASE..."
    git switch -c "$BRANCH" "origin/$BASE"
fi

ensure_clean_worktree "before starting Codex"

CURRENT_BRANCH="$(git branch --show-current)"

[[ "$CURRENT_BRANCH" == "$BRANCH" ]] \
    || die "Expected branch '$BRANCH', but current branch is '$CURRENT_BRANCH'."

# ==============================================================================
# Validate review document
# ==============================================================================

[[ -f "$REVIEW" ]] \
    || die "Review file not found on $BRANCH: $REVIEW"

git ls-files --error-unmatch "$REVIEW" >/dev/null 2>&1 \
    || die \
        "Review file is not tracked by Git: $REVIEW

Commit the review document before running this automation."

# ==============================================================================
# Temporary validation area
# ==============================================================================

TMP_DIR="$(mktemp -d)"

cleanup() {
    rm -rf "$TMP_DIR"
}

trap cleanup EXIT

# ==============================================================================
# Process exactly one finding per Codex invocation
# ==============================================================================

i=0

while (( i < MAX )); do

    before="$(count_unchecked)"

    if (( before == 0 )); then
        break
    fi

    i=$((i + 1))

    # --------------------------------------------------------------------------
    # Identify exactly the first unchecked finding
    # --------------------------------------------------------------------------

    target_line="$(
        grep -n -m1 '^- \[ \]' "$REVIEW" |
            cut -d: -f1
    )"

    [[ -n "$target_line" ]] \
        || die "Could not determine the first unchecked review line."

    original_line="$(
        sed -n "${target_line}p" "$REVIEW"
    )"

    finding="${original_line#- [ ] }"

    [[ -n "$finding" ]] \
        || die "Could not extract finding from line $target_line."

    echo
    echo "=============================================================================="
    echo "Finding $i / maximum $MAX"
    echo "Remaining before this run: $before"
    echo
    echo "Line $target_line:"
    echo "  $finding"
    echo "=============================================================================="
    echo

    # Every Codex run starts from a deterministic state.
    ensure_clean_worktree "before Codex iteration $i"

    # --------------------------------------------------------------------------
    # Save the exact expected review-file result
    # --------------------------------------------------------------------------

    cp "$REVIEW" "$TMP_DIR/review-before.md"

    sed \
        "${target_line}s/^- \[ \]/- [x]/" \
        "$TMP_DIR/review-before.md" \
        >"$TMP_DIR/review-expected.md"

    # --------------------------------------------------------------------------
    # Remember Git state before handing control to Codex
    # --------------------------------------------------------------------------

    head_before="$(git rev-parse HEAD)"
    branch_before="$(git branch --show-current)"

    # --------------------------------------------------------------------------
    # Codex prompt
    # --------------------------------------------------------------------------

    prompt="$(cat <<EOF
You are working inside an existing Git repository.

The review document is:

$REVIEW

Work on EXACTLY ONE review finding.

The finding assigned to you is the FIRST currently unchecked finding,
located at line $target_line:

$original_line

Its text is:

$finding


TASK

1. Read this finding carefully.

2. Inspect only the code, tests, documentation, and repository instructions
   necessary to understand and fix this finding correctly.

3. Implement the smallest correct change that resolves this finding.

4. Do NOT work on any other unchecked review finding.

5. Do NOT perform unrelated:
   - refactoring
   - cleanup
   - formatting
   - renaming
   - architectural changes
   - dependency upgrades

6. Follow all repository-level agent instructions, skills, and conventions
   that apply to the files you modify.

7. Run the relevant existing tests for the affected functionality.

8. Add or update tests if that is reasonably necessary to prove the fix.

9. If appropriate, run related regression tests as well.

10. Inspect the resulting diff before declaring the finding complete.


MARKING THE REVIEW FINDING

Only after:

- the implementation is complete,
- the finding is actually resolved,
- relevant tests pass,

change EXACTLY this review line:

$original_line

to:

- [x] $finding

Do not change any other text in:

$REVIEW

Do not mark any other checkbox complete.


GIT OWNERSHIP

The surrounding shell automation owns Git history.

Therefore you MUST NOT run:

- git add
- git commit
- git push
- git checkout
- git switch
- git merge
- git rebase
- git reset
- git restore
- git stash
- gh pr create
- gh pr merge

Do not create commits.
Do not stage files.
Do not change branches.
Do not push anything.


FAILURE BEHAVIOR

If you cannot safely and correctly complete this finding:

- leave its checkbox unchecked;
- leave useful implementation/debugging changes in the working tree if
  they help diagnose the problem;
- explain clearly why the finding could not be completed;
- do not proceed to another finding.


SUCCESS BEHAVIOR

If the finding is successfully fixed:

- leave the implementation changes unstaged in the working tree;
- leave exactly this finding marked [x];
- stop.

Do not start another finding.
EOF
)"

    # --------------------------------------------------------------------------
    # Run Codex
    # --------------------------------------------------------------------------

    if ! codex exec --full-auto "$prompt"; then
        echo
        echo "Codex exited with a non-zero status."
        echo
        echo "The working tree has intentionally been left untouched"
        echo "so you can inspect what Codex changed."
        exit 1
    fi

    echo
    echo "Validating Codex result..."

    # --------------------------------------------------------------------------
    # Codex must not change branches
    # --------------------------------------------------------------------------

    branch_after="$(git branch --show-current)"

    if [[ "$branch_after" != "$branch_before" ]]; then
        die \
            "Codex changed branches.

Before: $branch_before
After:  $branch_after

The repository has been left untouched for manual inspection."
    fi

    # --------------------------------------------------------------------------
    # Codex must not create commits
    # --------------------------------------------------------------------------

    head_after="$(git rev-parse HEAD)"

    if [[ "$head_after" != "$head_before" ]]; then
        die \
            "Codex created or changed commits.

Before: $head_before
After:  $head_after

The automation will not attempt to undo this automatically."
    fi

    # --------------------------------------------------------------------------
    # Codex must not stage files
    # --------------------------------------------------------------------------

    if ! git diff --cached --quiet; then
        echo
        echo "Unexpected staged changes:"
        echo
        git diff --cached --stat
        echo

        die \
            "Codex staged files even though Git staging is owned by the wrapper."
    fi

    # --------------------------------------------------------------------------
    # Verify EXACTLY the assigned checkbox changed
    # --------------------------------------------------------------------------

    if ! cmp -s "$REVIEW" "$TMP_DIR/review-expected.md"; then
        echo
        echo "Unexpected changes were made to $REVIEW:"
        echo
        git diff -- "$REVIEW"
        echo

        die \
            "The review file differs from the exact expected result.

Expected:
  only line $target_line
  '- [ ]' -> '- [x]'

No other review-file changes are permitted."
    fi

    # --------------------------------------------------------------------------
    # Count must decrease by exactly one
    # --------------------------------------------------------------------------

    after="$(count_unchecked)"
    expected=$((before - 1))

    if (( after != expected )); then
        die \
            "Unexpected checkbox count.

Before:   $before
Expected: $expected
Actual:   $after"
    fi

    # --------------------------------------------------------------------------
    # Verify Codex actually changed implementation files
    # --------------------------------------------------------------------------

    changed_tracked="$(
        git diff --name-only -- |
            grep -Fvx -- "$REVIEW" ||
            true
    )"

    changed_untracked="$(
        git ls-files --others --exclude-standard |
            grep -Fvx -- "$REVIEW" ||
            true
    )"

    if [[ -z "$changed_tracked" && -z "$changed_untracked" ]]; then
        die \
            "Codex marked the finding complete but produced no changes outside the review document."
    fi

    echo
    echo "Files changed for this finding:"
    {
        [[ -n "$changed_tracked" ]] && printf '%s\n' "$changed_tracked"
        [[ -n "$changed_untracked" ]] && printf '%s\n' "$changed_untracked"
    } |
        sed 's/^/  /'

    # --------------------------------------------------------------------------
    # Basic diff validation
    # --------------------------------------------------------------------------

    if ! git diff --check; then
        die \
            "git diff --check found whitespace or conflict-marker problems."
    fi

    # --------------------------------------------------------------------------
    # Stage only after all validations succeeded
    # --------------------------------------------------------------------------

    git add -A

    # Validate staged version too, including newly created files.
    if ! git diff --cached --check; then
        die \
            "git diff --cached --check found problems.

Changes have been left staged for manual inspection."
    fi

    # --------------------------------------------------------------------------
    # Commit exactly this finding
    # --------------------------------------------------------------------------

    short_finding="$(
        printf '%s' "$finding" |
            tr '\n' ' ' |
            cut -c1-68
    )"

    echo
    echo "Creating commit..."

    git commit -m "fix: $short_finding"

    # --------------------------------------------------------------------------
    # Push progress immediately
    # --------------------------------------------------------------------------

    echo
    echo "Pushing $BRANCH..."

    git push -u origin "$BRANCH"

    echo
    echo "Finding completed and pushed:"
    echo "  $finding"

done

# ==============================================================================
# Final review state
# ==============================================================================

remaining="$(count_unchecked)"

echo
echo "=============================================================================="

if (( remaining > 0 )); then
    echo "Review processing stopped."
    echo "Remaining unchecked findings: $remaining"

    if (( i >= MAX )); then
        echo
        echo "Reason: safety limit MAX=$MAX was reached."
    fi

    echo "=============================================================================="

    exit 1
fi

echo "All review findings are complete."
echo "=============================================================================="
echo

ensure_clean_worktree "after completing all findings"

# Ensure the final branch definitely exists remotely.
git push -u origin "$BRANCH"

# ==============================================================================
# Pull request
# ==============================================================================

require_command gh

if ! gh auth status >/dev/null 2>&1; then
    die \
        "GitHub CLI is installed but is not authenticated.

Run:

  gh auth login

The fixes and commits are already safely pushed."
fi

# Check for ANY existing PR associated with this branch.
existing_pr="$(
    gh pr list \
        --head "$BRANCH" \
        --base "$BASE" \
        --state all \
        --json url \
        --jq '.[0].url // empty'
)"

if [[ -n "$existing_pr" ]]; then
    echo "A pull request already exists for this branch:"
    echo
    echo "  $existing_pr"
    echo
    exit 0
fi

# If the branch has no commits that are absent from base, there is
# nothing useful to create a PR for.
commits_ahead="$(
    git rev-list --count "origin/$BASE..$BRANCH"
)"

if (( commits_ahead == 0 )); then
    echo "No commits exist on $BRANCH that are not already in origin/$BASE."
    echo "No pull request is necessary."
    exit 0
fi

echo "Creating pull request..."
echo

pr_body="$(cat <<EOF
Automated fixes for all findings in:

\`$REVIEW\`

Processing policy:

- one review finding per Codex invocation;
- one finding per Git commit;
- relevant tests must pass before the checkbox is marked complete;
- the wrapper verifies the exact checkbox transition;
- Codex does not own commits, pushes, branches, or PR creation;
- each successfully validated finding is pushed immediately.
EOF
)"

gh pr create \
    --base "$BASE" \
    --head "$BRANCH" \
    --title "$TEXTPR" \
    --body "$pr_body"

echo
echo "Done."