#!/usr/bin/env bash
# Shared launch contract for the task and review runners. Source after setting
# REPO_ROOT and defining die() and assert_control_plane(). Sourcing this file
# does not launch a model session.

TOML_REPO_ROOT="${REPO_ROOT//\\/\\\\}"
TOML_REPO_ROOT="${TOML_REPO_ROOT//\"/\\\"}"

CODEX_SAFE_ARGS=(
    --ask-for-approval never
    exec
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

preflight_codex() {
    local output status=0
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
