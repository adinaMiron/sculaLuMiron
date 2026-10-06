#!/usr/bin/env bash
# This entire bootstrap is parsed before execution; no agent runs until exec.
{
    runner_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
    exec python3 -I "$runner_dir/trusted-runner.py" "$runner_dir/$(basename -- "${BASH_SOURCE[0]}")" "$@"
    exit 1
}
# TRUSTED_RUNNER_BODY
set -Eeuo pipefail

# Usage:
#   ./scripts/implement-tasks.sh song-creation
#
# Task metadata:
#   - [ ] [ID:wav-recording] [DEPENDS:audio-core,mic-access] Record WAV.
#   - [x] [ID:audio-core] Create shared audio capture layer.
#
# Tasks without ID/DEPENDS are treated as independent tasks.

usage() {
    cat <<'TXT'
Usage:
  ./scripts/implement-tasks.sh <module>

Examples:
  ./scripts/implement-tasks.sh song-creation
  MAX_TASKS=3 ./scripts/implement-tasks.sh song-creation
  CREATE_PR=false ./scripts/implement-tasks.sh song-creation

Optional environment variables:
  BASE=main
  TASK_BRANCH=feat/<module>
  MAX_TASKS=50
  CREATE_PR=true
  FINAL_REVIEW=true
TXT
}

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

extract_id() {
    printf '%s\n' "$1" | sed -nE 's/.*\[ID:([A-Za-z0-9._-]+)\].*/\1/p'
}

extract_deps() {
    local raw
    raw="$(printf '%s\n' "$1" | sed -nE 's/.*\[DEPENDS:([^]]*)\].*/\1/p')"
    printf '%s' "$raw" | tr -d '[:space:]'
}

extract_task_text() {
    printf '%s\n' "$1" |
        sed -E \
            -e 's/^[[:space:]]*- \[[ xX]\][[:space:]]*//' \
            -e 's/\[ID:[^]]+\][[:space:]]*//g' \
            -e 's/\[DEPENDS:[^]]*\][[:space:]]*//g' \
            -e 's/[[:space:]]+$//'
}

count_unchecked() {
    local total=0 file count
    while IFS= read -r -d '' file; do
        count="$(grep -cE "$TASK_PATTERN" "$file" || true)"
        total=$((total + count))
    done < <(find "$TASKS_ROOT" -type f -name '*.md' -print0 | sort -z)
    printf '%s\n' "$total"
}

build_checkbox_manifest() {
    local file line_number line
    while IFS= read -r -d '' file; do
        line_number=0
        while IFS= read -r line || [[ -n "$line" ]]; do
            line_number=$((line_number + 1))
            if printf '%s\n' "$line" | grep -qE "$ANY_CHECKBOX_PATTERN"; then
                printf '%s\t%s\t%s\n' "$file" "$line_number" "$line"
            fi
        done < "$file"
    done < <(find "$TASKS_ROOT" -type f -name '*.md' -print0 | sort -z)
}

build_other_checkbox_manifest() {
    local excluded_file="$1"
    build_checkbox_manifest | awk -F '\t' -v target="$excluded_file" '$1 != target'
}

# Module-wide dependency graph.
declare -A ID_STATE=()
declare -A ID_DEPS=()
declare -A ID_LOCATION=()
declare -A DFS_STATE=()
declare -a TASK_ID_ORDER=()
CYCLE_AT=""

visit_dependency_node() {
    local id="$1" dep deps state
    local -a dep_array=()
    state="${DFS_STATE[$id]:-0}"

    if [[ "$state" == "1" ]]; then
        CYCLE_AT="$id"
        return 1
    fi
    [[ "$state" == "2" ]] && return 0

    DFS_STATE[$id]=1
    deps="${ID_DEPS[$id]:-}"
    if [[ -n "$deps" ]]; then
        IFS=',' read -r -a dep_array <<< "$deps"
        for dep in "${dep_array[@]}"; do
            [[ -z "$dep" ]] && continue
            visit_dependency_node "$dep" || return 1
        done
    fi
    DFS_STATE[$id]=2
    return 0
}

validate_task_graph() {
    local file line line_number state id deps dep location
    local -a dep_array=()
    local -A local_seen=()

    ID_STATE=()
    ID_DEPS=()
    ID_LOCATION=()
    TASK_ID_ORDER=()
    DFS_STATE=()
    CYCLE_AT=""

    # First pass: collect IDs and metadata.
    while IFS= read -r -d '' file; do
        line_number=0
        while IFS= read -r line || [[ -n "$line" ]]; do
            line_number=$((line_number + 1))
            printf '%s\n' "$line" | grep -qE "$ANY_CHECKBOX_PATTERN" || continue

            id="$(extract_id "$line")"
            deps="$(extract_deps "$line")"
            location="$file:$line_number"

            if [[ "$line" == *"[ID:"* && -z "$id" ]]; then
                die "Malformed [ID:...] metadata at $location"
            fi
            if [[ "$line" == *"[DEPENDS:"* && -z "$deps" ]]; then
                die "Malformed or empty [DEPENDS:...] metadata at $location; omit DEPENDS when there are no prerequisites"
            fi
            if [[ -n "$deps" && -z "$id" ]]; then
                die "A task using [DEPENDS:...] must also have [ID:...] at $location"
            fi

            [[ -z "$id" ]] && continue

            if [[ -n "${ID_LOCATION[$id]+x}" ]]; then
                die "Duplicate task ID '$id': ${ID_LOCATION[$id]} and $location"
            fi

            if printf '%s\n' "$line" | grep -qE '^[[:space:]]*- \[[xX]\]'; then
                state="complete"
            else
                state="pending"
            fi

            ID_STATE[$id]="$state"
            ID_DEPS[$id]="$deps"
            ID_LOCATION[$id]="$location"
            TASK_ID_ORDER+=("$id")
        done < "$file"
    done < <(find "$TASKS_ROOT" -type f -name '*.md' -print0 | sort -z)

    # Second pass: validate dependency references and duplicates.
    for id in "${TASK_ID_ORDER[@]}"; do
        deps="${ID_DEPS[$id]:-}"
        [[ -z "$deps" ]] && continue

        local_seen=()
        dep_array=()
        IFS=',' read -r -a dep_array <<< "$deps"
        for dep in "${dep_array[@]}"; do
            [[ -z "$dep" ]] && die "Empty dependency in task '$id' at ${ID_LOCATION[$id]}"
            [[ "$dep" == "$id" ]] && die "Task '$id' depends on itself at ${ID_LOCATION[$id]}"
            [[ -n "${ID_LOCATION[$dep]+x}" ]] || die "Task '$id' depends on unknown task ID '$dep' at ${ID_LOCATION[$id]}"
            if [[ -n "${local_seen[$dep]+x}" ]]; then
                die "Task '$id' lists dependency '$dep' more than once at ${ID_LOCATION[$id]}"
            fi
            local_seen[$dep]=1
        done
    done

    # Third pass: reject cycles before any work starts.
    for id in "${TASK_ID_ORDER[@]}"; do
        if ! visit_dependency_node "$id"; then
            die "Dependency cycle detected involving task '$CYCLE_AT' (${ID_LOCATION[$CYCLE_AT]})"
        fi
    done
}

dependencies_complete() {
    local deps="$1" dep
    local -a dep_array=()
    [[ -z "$deps" ]] && return 0
    IFS=',' read -r -a dep_array <<< "$deps"
    for dep in "${dep_array[@]}"; do
        [[ "${ID_STATE[$dep]:-pending}" == "complete" ]] || return 1
    done
    return 0
}

find_first_ready_task() {
    local file line line_number deps

    TARGET_FILE=""
    TARGET_LINE=""
    ORIGINAL_LINE=""
    TASK_TEXT=""
    TASK_ID=""
    TASK_DEPS=""

    while IFS= read -r -d '' file; do
        line_number=0
        while IFS= read -r line || [[ -n "$line" ]]; do
            line_number=$((line_number + 1))
            printf '%s\n' "$line" | grep -qE "$TASK_PATTERN" || continue

            deps="$(extract_deps "$line")"
            if dependencies_complete "$deps"; then
                TARGET_FILE="$file"
                TARGET_LINE="$line_number"
                ORIGINAL_LINE="$line"
                TASK_TEXT="$(extract_task_text "$line")"
                TASK_ID="$(extract_id "$line")"
                TASK_DEPS="$deps"
                return 0
            fi
        done < "$file"
    done < <(find "$TASKS_ROOT" -type f -name '*.md' -print0 | sort -z)

    return 1
}

print_blocked_tasks() {
    local file line line_number deps dep waiting text id
    local -a dep_array=()
    echo "Blocked tasks:"
    while IFS= read -r -d '' file; do
        line_number=0
        while IFS= read -r line || [[ -n "$line" ]]; do
            line_number=$((line_number + 1))
            printf '%s\n' "$line" | grep -qE "$TASK_PATTERN" || continue
            deps="$(extract_deps "$line")"
            dependencies_complete "$deps" && continue

            waiting=""
            IFS=',' read -r -a dep_array <<< "$deps"
            for dep in "${dep_array[@]}"; do
                [[ "${ID_STATE[$dep]:-pending}" == "complete" ]] && continue
                waiting+="${waiting:+, }$dep"
            done

            id="$(extract_id "$line")"
            text="$(extract_task_text "$line")"
            printf '  - %s:%s%s\n      %s\n      waiting for: %s\n' \
                "$file" "$line_number" "${id:+ [$id]}" "$text" "$waiting"
        done < "$file"
    done < <(find "$TASKS_ROOT" -type f -name '*.md' -print0 | sort -z)
}

# ------------------------------------------------------------------------------
# Arguments / configuration
# ------------------------------------------------------------------------------

(( $# == 1 )) || { usage; exit 2; }
MODULE="$1"
[[ "$MODULE" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || die "Invalid module name: $MODULE"

BASE="${BASE:-main}"
TASKS_ROOT="docs/tasks/$MODULE"
BRANCH="${TASK_BRANCH:-feat/$MODULE}"
MAX="${MAX_TASKS:-50}"
CREATE_PR="${CREATE_PR:-true}"
FINAL_REVIEW="${FINAL_REVIEW:-true}"

TASK_PATTERN='^[[:space:]]*- \[ \]'
ANY_CHECKBOX_PATTERN='^[[:space:]]*- \[[ xX]\]'

[[ "$MAX" =~ ^[1-9][0-9]*$ ]] || die "MAX_TASKS must be a positive integer"
[[ "$CREATE_PR" == "true" || "$CREATE_PR" == "false" ]] || die "CREATE_PR must be true or false"
[[ "$FINAL_REVIEW" == "true" || "$FINAL_REVIEW" == "false" ]] || die "FINAL_REVIEW must be true or false"

for cmd in git grep sed find sort awk cmp diff codex tr tee; do
    require_command "$cmd"
done

# REPO_ROOT is supplied by the sealed trusted launcher.
cd "$REPO_ROOT"
[[ -d "$TASKS_ROOT" ]] || die "Task module does not exist: $TASKS_ROOT"

# ------------------------------------------------------------------------------
# Hardened Codex execution boundary
# ------------------------------------------------------------------------------
#
# The parent Bash process keeps its normal network access so it can fetch/push
# Git and create the PR.  Every Codex child process gets a stricter policy:
#
#   - workspace writes allowed;
#   - outbound network for agent-executed commands denied;
#   - no interactive permission escalation;
#   - hosted web search disabled;
#   - apps/connectors/plugins/hooks/multi-agent features disabled;
#   - user Codex config and exec-policy rules ignored for the child run;
#   - project .codex config is treated as untrusted/skipped;
#   - sessions are ephemeral;
#   - shell environment inheritance is reduced and secret-name filtering enabled.
#
# IMPORTANT: the Codex CLI itself still needs to contact its configured model
# provider unless you intentionally run it with a fully local model/provider.

source "/proc/self/fd/$WRAPPER_HELPER_FD"
preflight_codex

validate_task_graph

# ------------------------------------------------------------------------------
# Git branch preparation
# ------------------------------------------------------------------------------

echo
echo "Repository:   $REPO_ROOT"
echo "Module:       $MODULE"
echo "Tasks:        $TASKS_ROOT"
echo "Base:         $BASE"
echo "Branch:       $BRANCH"
echo "Max tasks:    $MAX"
echo "Final review: $FINAL_REVIEW"
echo "Create PR:    $CREATE_PR"
echo

ensure_clean_worktree "before branch preparation"
git fetch origin --prune
git show-ref --verify --quiet "refs/remotes/origin/$BASE" || die "origin/$BASE does not exist"

if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
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

ensure_clean_worktree "before task processing"
[[ "$(git branch --show-current)" == "$BRANCH" ]] || die "Failed to activate $BRANCH"

if ! git merge-base --is-ancestor "origin/$BASE" "$BRANCH"; then
    die "$BRANCH does not contain current origin/$BASE; rebase manually before continuing"
fi

trap release_validation_evidence EXIT

# ------------------------------------------------------------------------------
# Implementation loop
# ------------------------------------------------------------------------------

iteration=0

while (( iteration < MAX )); do
    validate_task_graph
    before="$(count_unchecked)"
    (( before == 0 )) && break

    if ! find_first_ready_task; then
        echo
        print_blocked_tasks
        die "No dependency-ready task exists although $before task(s) remain unchecked"
    fi

    iteration=$((iteration + 1))

    git ls-files --error-unmatch "$TARGET_FILE" >/dev/null 2>&1 || die "Task document is not tracked: $TARGET_FILE"
    ensure_clean_worktree "before Codex task $iteration"

    echo
    echo "=============================================================================="
    echo "Task $iteration / $MAX"
    echo "=============================================================================="
    echo "Document:     $TARGET_FILE:$TARGET_LINE"
    echo "Task ID:      ${TASK_ID:-<none>}"
    echo "Dependencies: ${TASK_DEPS:-<none>}"
    echo "Requirement:  $TASK_TEXT"
    echo

    seal_validation_evidence \
        <(sed "${TARGET_LINE}s/- \[ \]/- [x]/" "$TARGET_FILE") \
        <(build_other_checkbox_manifest "$TARGET_FILE")

    head_before="$(git rev-parse HEAD)"
    branch_before="$(git branch --show-current)"

    prompt="$(cat <<PROMPT
You are implementing exactly ONE documented requirement in an existing Git repository.

MODULE
$MODULE

TASK DOCUMENTATION
$TASKS_ROOT

ASSIGNED REQUIREMENT
Document: $TARGET_FILE
Line: $TARGET_LINE
Task ID: ${TASK_ID:-none}
Dependencies: ${TASK_DEPS:-none}
Exact current line:
$ORIGINAL_LINE

Requirement:
$TASK_TEXT

DEPENDENCY RULE
The orchestration script has verified that every declared dependency of this task is already complete.
Do not implement dependency tasks or any later task. Treat completed dependencies as existing prerequisites that may be reused.

WORKFLOW
1. Read the assigned requirement and only the nearby/relevant project context needed to understand it.
2. Check whether the requirement is already correctly implemented.
3. If already implemented, verify it and run relevant tests; do not rewrite correct code merely to create a diff.
4. Otherwise implement the smallest complete solution following existing architecture and conventions.
5. Add or update tests when reasonably necessary.
6. Run relevant tests and appropriate regression tests.
7. Inspect the final diff and verify the exact requirement is satisfied.

SCOPE LIMITS
Do not perform unrelated refactoring, cleanup, formatting, renaming, dependency upgrades, architecture changes, or feature additions.
Do not work on another unchecked requirement.

TASK STATUS
Only after the requirement is genuinely satisfied and relevant tests pass, change exactly this checkbox line from [ ] to [x]:
$ORIGINAL_LINE

Do not change its wording.
Do not change any other checkbox anywhere under $TASKS_ROOT.
Do not add new checkbox tasks during this run.

CONTROL PLANE
Do not modify scripts/, .github/, .githooks/, .gitattributes, or .gitmodules.
The wrapper rejects changes to these paths, including new or ignored files.
Control-plane maintenance requires a separate human-reviewed change.

NETWORK / EXTERNAL-TOOL POLICY
Do not use web search, browser tools, apps/connectors, plugins, MCP tools, curl, wget,
network package installation, remote APIs, or any command that requires outbound network access.
Use only repository files, installed local tooling, and local tests.

GIT OWNERSHIP
The shell wrapper owns Git history and remotes.
Do NOT run git add, commit, push, checkout, switch, merge, rebase, reset, restore, stash, cherry-pick, or gh PR commands.
Read-only git status/diff/log/show commands are allowed.

FAILURE
If the requirement cannot be completed safely, leave it unchecked, preserve useful diagnostic work, explain the blocker, and stop.

SUCCESS
Leave implementation/tests/documentation changes unstaged, leave exactly this requirement marked [x], and stop. Do not start another task.
PROMPT
)"

    if ! run_codex_safely "$prompt"; then
        die "Codex failed; working tree preserved for inspection"
    fi

    [[ "$(git branch --show-current)" == "$branch_before" ]] || die "Codex changed branches"
    [[ "$(git rev-parse HEAD)" == "$head_before" ]] || die "Codex changed Git history"
    git diff --cached --quiet || die "Codex staged files"

    if ! cmp -s "$TARGET_FILE" "${EVIDENCE_PATHS[0]}"; then
        git diff -- "$TARGET_FILE" || true
        die "Assigned task document changed unexpectedly; only the target [ ] -> [x] transition is allowed"
    fi

    if ! build_other_checkbox_manifest "$TARGET_FILE" | cmp -s "${EVIDENCE_PATHS[1]}" -; then
        diff -u "${EVIDENCE_PATHS[1]}" <(build_other_checkbox_manifest "$TARGET_FILE") || true
        die "Another task checkbox was modified"
    fi

    validate_task_graph
    after="$(count_unchecked)"
    expected=$((before - 1))
    (( after == expected )) || die "Unchecked task count changed unexpectedly: $before -> $after (expected $expected)"

    release_validation_evidence || die "Validation evidence holder failed"

    git diff --check || die "git diff --check failed"

    changed_outside_task_file="$({ git diff --name-only; git ls-files --others --exclude-standard; } | sort -u | grep -Fvx -- "$TARGET_FILE" || true)"
    if [[ -z "$changed_outside_task_file" ]]; then
        commit_prefix="docs"
        echo "Requirement was already implemented and verified."
    else
        commit_prefix="feat"
        echo "Changed files:"
        printf '%s\n' "$changed_outside_task_file" | sed 's/^/  /'
    fi

    git add -A
    git diff --cached --check || die "Staged diff validation failed"

    short_task="$(printf '%s' "$TASK_TEXT" | tr '\n' ' ' | tr -s ' ' | cut -c1-68)"
    git commit -m "$commit_prefix($MODULE): $short_task"
    git push -u origin "$BRANCH"

done

# ------------------------------------------------------------------------------
# End-of-run state
# ------------------------------------------------------------------------------

validate_task_graph
remaining="$(count_unchecked)"
if (( remaining > 0 )); then
    echo
    echo "Task limit reached. Completed this run: $iteration; remaining: $remaining"
    echo "Completed work is committed and pushed. Run the same command again to continue."
    exit 0
fi

ensure_clean_worktree "before final review"
echo
echo "All requirements for '$MODULE' are complete."

# ------------------------------------------------------------------------------
# Independent final review
# ------------------------------------------------------------------------------

if [[ "$FINAL_REVIEW" == "true" ]]; then
    reviewer_head_before="$(git rev-parse HEAD)"
    reviewer_branch_before="$(git branch --show-current)"
    REVIEW_OUTPUT="$REPO_ROOT/.git/codex-task-final-review-$MODULE.txt"

    review_prompt="$(cat <<PROMPT
You are the FINAL REVIEWER for the completed module: $MODULE

Requirements and plans are under:
$TASKS_ROOT

All actionable requirements are marked [x]. Review the complete module independently.

Verify:
1. every completed requirement is actually satisfied;
2. dependency relationships expressed with [ID:...] and [DEPENDS:...] are coherent in the implementation;
3. integration between individually implemented requirements works;
4. relevant tests exist and pass;
5. there are no obvious regressions, missing behaviors, duplicated implementations, or documentation/implementation mismatches.

Run appropriate regression tests.

STRICT REVIEW-ONLY ROLE
Do not edit source, tests, docs, checkbox state, Git staging/history/branches/remotes, or PRs.
Do not use web search, browser tools, apps/connectors, plugins, MCP tools, curl, wget,
network package installation, remote APIs, or any command that requires outbound network access.
Use only repository files and already-installed local tooling.

At the very end output exactly one line:
VERDICT: PASS
or
VERDICT: FAIL

Use PASS only if the module satisfies the documented requirements and relevant tests pass. Explain specific failures before a FAIL verdict.
PROMPT
)"

    if ! run_codex_safely "$review_prompt" | tee "$REVIEW_OUTPUT"; then
        die "Final reviewer exited with an error; no PR will be created. Review output: $REVIEW_OUTPUT"
    fi

    [[ "$(git branch --show-current)" == "$reviewer_branch_before" ]] || die "Final reviewer changed branches"
    [[ "$(git rev-parse HEAD)" == "$reviewer_head_before" ]] || die "Final reviewer changed Git history"
    [[ -z "$(git status --porcelain)" ]] || die "Final reviewer modified the working tree"

    if grep -qx 'VERDICT: FAIL' "$REVIEW_OUTPUT"; then
        die "Final review failed; feature branch remains pushed and no PR was created. Review output: $REVIEW_OUTPUT"
    fi
    grep -qx 'VERDICT: PASS' "$REVIEW_OUTPUT" || die "Final reviewer did not emit VERDICT: PASS or VERDICT: FAIL"
fi

git push -u origin "$BRANCH"

# ------------------------------------------------------------------------------
# Pull request
# ------------------------------------------------------------------------------

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

pr_body="$(cat <<EOF2
Implements the documented requirements for \`$MODULE\` under \`$TASKS_ROOT\`.

Policy:
- dependency-aware task selection using \`[ID:...]\` and \`[DEPENDS:...]\`;
- one dependency-ready requirement per Codex invocation;
- one validated requirement per commit;
- relevant tests must pass before completion;
- only the assigned checkbox may change per iteration;
- the shell wrapper owns Git commits, pushes, branches, and PR creation;
- every completed task is pushed immediately;
- an independent final review runs before PR creation.
EOF2
)"

gh pr create \
    --base "$BASE" \
    --head "$BRANCH" \
    --title "Implement $MODULE requirements" \
    --body "$pr_body"

echo "Done."
