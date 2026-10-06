#!/usr/bin/env bash
# Shared launch contract for the task and review runners. Source after setting
# REPO_ROOT and defining die(); this file does not launch a model session.

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

run_codex_safely() {
    codex "${CODEX_SAFE_ARGS[@]}" "$@"
}

preflight_codex() {
    local output status=0
    # In codex-cli 0.160.0, exec loads and validates config (including feature
    # names) before rejecting an empty stdin prompt, without starting a session.
    # Unlike --help, this exercises the complete launch contract. Strict config
    # rejects unknown keys instead of silently ignoring safety overrides.
    # Use the same argv, working directory and environment as the real launch.
    output="$(run_codex_safely - </dev/null 2>&1)" || status=$?
    if [[ "$status" != 1 || "${output##*$'\n'}" != 'No prompt provided via stdin.' ]]; then
        printf '%s\n' "$output" >&2
        die "Codex CLI/configuration preflight failed (exit $status); no Git changes were made. The installed CLI must support the runner's strict configuration and empty-stdin validation contract (verified with codex-cli 0.160.0)."
    fi
}
