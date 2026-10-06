#!/usr/bin/env bash
# Shared launch contract for the task and review runners. Source after setting
# REPO_ROOT and defining die() and assert_control_plane(). Sourcing this file
# does not launch a model session.

TOML_REPO_ROOT="${REPO_ROOT//\\/\\\\}"
TOML_REPO_ROOT="${TOML_REPO_ROOT//\"/\\\"}"

CODEX_SAFE_ARGS=(
    --ask-for-approval never
    exec
    --json
    --strict-config
    --ephemeral
    --ignore-user-config
    --ignore-rules
    --sandbox workspace-write
    -c 'sandbox_workspace_write.network_access=false'
    -c 'web_search="disabled"'
    -c 'check_for_update_on_startup=false'
    -c 'analytics.enabled=false'
    -c 'shell_environment_policy.inherit="core"'
    -c 'shell_environment_policy.ignore_default_excludes=false'
    -c 'allow_login_shell=false'
    -c "projects.\"$TOML_REPO_ROOT\".trust_level=\"untrusted\""
    --disable apps
    --disable plugins
    --disable remote_plugin
    --disable multi_agent
    --disable hooks
    --disable goals
    --disable memories
)

build_other_checkbox_manifest() {
    markdown_tasks scope-manifest . --exclude "$1"
}

check_other_checkboxes() {
    local actual
    actual="$(build_other_checkbox_manifest "$1")" || die "Cannot inventory task/review checkboxes"
    if ! printf '%s' "$actual" | cmp -s "${EVIDENCE_PATHS[1]}" -; then
        die "Unassigned task/review checkbox changes rejected; working tree preserved"
    fi
}

# A fresh holder per iteration keeps sealed evidence alive without putting it
# in the workspace or scratch directories. Neither chmod nor same-UID writes
# can undo the seals. Close the pipe and reap the holder on success or failure.
release_validation_evidence() {
    local status=0
    if [[ -n "${EVIDENCE_PID:-}" ]]; then
        exec {EVIDENCE_INPUT}>&-
        exec {EVIDENCE_OUTPUT}<&-
        wait "$EVIDENCE_PID" || status=1
        unset EVIDENCE_PID
    fi
    return "$status"
}

seal_validation_evidence() {
    release_validation_evidence || die "Validation evidence holder failed"
    coproc EVIDENCE_HOLDER {
        exec python3 -I "/proc/self/fd/$WRAPPER_CHECKER_FD" --hold-evidence "$@"
    }
    EVIDENCE_PID=$EVIDENCE_HOLDER_PID
    EVIDENCE_INPUT=${EVIDENCE_HOLDER[1]}
    EVIDENCE_OUTPUT=${EVIDENCE_HOLDER[0]}
    unset EVIDENCE_HOLDER EVIDENCE_HOLDER_PID
    EVIDENCE_PATHS=()
    local input evidence_path
    for input in "$@"; do
        IFS= read -r evidence_path <&"$EVIDENCE_OUTPUT" || die "Could not seal validation evidence"
        EVIDENCE_PATHS+=("$evidence_path")
    done
}

run_codex_safely() {
    local status=0
    assert_control_plane
    codex "${CODEX_SAFE_ARGS[@]}" "$@" || status=$?
    # Check even a failed agent before the host inspects or publishes output.
    assert_control_plane
    return "$status"
}

assert_retry_git_state() {
    [[ "$(git branch --show-current)" == "$2" ]] || die "Codex changed branches"
    [[ "$(git rev-parse HEAD)" == "$1" ]] || die "Codex changed Git history"
    git diff --cached --quiet || die "Codex staged files"
}

assert_item_retry_state() {
    assert_retry_git_state "$head_before" "$branch_before"
    # The interrupted agent may have completed its checkbox already. Accept
    # either original or completed text, always against the original evidence.
    if ! cmp -s "$1" "${EVIDENCE_PATHS[0]}" &&
       ! sed "${2}s/- \[x\]/- [ ]/" "${EVIDENCE_PATHS[0]}" | cmp -s "$1" -; then
        die "Assigned document changed unexpectedly during usage-limit recovery"
    fi
    check_other_checkboxes "$1"
}

wait_for_usage_reset() {
    local sleep_pid
    # Waiting in the background lets Bash handle signals immediately. Reap the
    # sleeper so cancellation does not leave a child holding the runner lock.
    sleep "$1" &
    sleep_pid=$!
    trap 'kill "$sleep_pid" 2>/dev/null || true; wait "$sleep_pid" 2>/dev/null || true; exit 130' INT
    trap 'kill "$sleep_pid" 2>/dev/null || true; wait "$sleep_pid" 2>/dev/null || true; exit 143' TERM
    local status=0
    wait "$sleep_pid" || status=$?
    trap - INT TERM
    return "$status"
}

run_codex_with_usage_retry() {
    local guard="$1"
    shift
    local -a args=("$@")
    local original_prompt="${!#}"
    local status delay events_pid events_input events_output parser_status output_file="" i
    for (( i=0; i<${#args[@]}-1; i++ )); do
        if [[ "${args[i]}" == --output-last-message ]]; then
            output_file="${args[i+1]}"
        fi
    done
    while true; do
        assert_control_plane
        if [[ -n "$output_file" ]]; then
            : > "$output_file" || die "Cannot initialize final review output: $output_file"
        fi
        # A pipe and trusted parser keep retry evidence out of agent-writable
        # temporary files, while preserving live diagnostics and the CLI status.
        coproc CODEX_EVENTS {
            exec python3 -I "/proc/self/fd/$WRAPPER_CHECKER_FD" --codex-events "$CODEX_USAGE_RETRY_SECONDS"
        }
        events_pid=$CODEX_EVENTS_PID
        events_input=${CODEX_EVENTS[1]}
        events_output=${CODEX_EVENTS[0]}
        unset CODEX_EVENTS CODEX_EVENTS_PID
        status=0
        codex "${CODEX_SAFE_ARGS[@]}" "${args[@]}" </dev/null >&"$events_input" || status=$?
        exec {events_input}>&-
        parser_status=0
        IFS= read -r delay <&"$events_output" || parser_status=1
        exec {events_output}<&-
        wait "$events_pid" || parser_status=1
        assert_control_plane
        (( parser_status == 0 )) || die "Codex event reader failed; working tree preserved"
        [[ "$delay" =~ ^[0-9]+$ ]] || die "Invalid Codex retry delay"
        (( status == 0 )) && return 0
        # Signals and unrelated failures must never start another model session.
        (( status < 128 && delay > 0 )) || return "$status"
        "$guard"
        printf 'Codex usage limit reached. Waiting %s seconds before retrying the same assignment (Ctrl+C to stop).\n' "$delay" >&2
        wait_for_usage_reset "$delay" || die "Usage-limit wait failed"
        assert_control_plane
        "$guard"
        # Sessions stay ephemeral. The original assignment plus the preserved
        # working tree are the continuation, not a newly selected checkbox.
        args[${#args[@]}-1]="$original_prompt"$'\n\nUSAGE-LIMIT RECOVERY\nA previous attempt was interrupted by a usage limit. Inspect the current diff and continue this same assignment from the preserved files. The assigned checkbox may already be checked; verify the implementation and tests before returning success. Preserve useful partial work and obey all original scope and review-only restrictions.'
    done
}

preflight_codex() {
    local output status=0
    CODEX_USAGE_RETRY_SECONDS="${CODEX_USAGE_RETRY_SECONDS:-300}"
    [[ "$CODEX_USAGE_RETRY_SECONDS" =~ ^[1-9][0-9]{0,5}$ ]] \
        || die "CODEX_USAGE_RETRY_SECONDS must be a positive integer of at most six digits"
    # In codex-cli 0.160.0, exec loads and validates config (including feature
    # names) before rejecting an empty stdin prompt, without starting a session.
    # Unlike --help, this exercises the complete launch contract. Strict config
    # rejects unknown keys instead of silently ignoring safety overrides.
    # Use the same argv, working directory and environment as the real launch.
    output="$(run_codex_safely "$@" - </dev/null 2>&1)" || status=$?
    if [[ "$status" != 1 || "${output##*$'\n'}" != 'No prompt provided via stdin.' ]]; then
        printf '%s\n' "$output" >&2
        die "Codex CLI/configuration preflight failed (exit $status); no Git changes were made. The installed CLI must support the runner's strict configuration and empty-stdin validation contract (verified with codex-cli 0.160.0)."
    fi
}
