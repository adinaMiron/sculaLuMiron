#!/usr/bin/env bash
# Shared launch contract for the task and review runners. Source after setting
# REPO_ROOT and defining die() and assert_control_plane(). Sourcing this file
# does not launch a model session.

# Validate before constructing argv. These values are single arguments, never
# evaluated as shell code or accepted as arbitrary CLI/config overrides.
CODEX_MODEL="${CODEX_MODEL:-}"
CODEX_EFFORT="${CODEX_EFFORT:-}"
[[ -z "$CODEX_MODEL" || "$CODEX_MODEL" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] \
    || die "CODEX_MODEL must be a model identifier containing only letters, digits, dots, underscores, or hyphens"
case "$CODEX_EFFORT" in
    ''|none|minimal|low|medium|high|xhigh|max|ultra) ;;
    *) die "CODEX_EFFORT must be none, minimal, low, medium, high, xhigh, max, or ultra (or unset for the model default)" ;;
esac

BROWSER_PREFLIGHT="${BROWSER_PREFLIGHT:-true}"
[[ "$BROWSER_PREFLIGHT" == true || "$BROWSER_PREFLIGHT" == false ]] \
    || die "BROWSER_PREFLIGHT must be true or false"

TOML_REPO_ROOT="${REPO_ROOT//\\/\\\\}"
TOML_REPO_ROOT="${TOML_REPO_ROOT//\"/\\\"}"

# Agent commands inherit only core variables plus these. The proxy sandbox
# exports HTTP(S)_PROXY/ALL_PROXY with an empty NO_PROXY and
# NODE_USE_ENV_PROXY=1 after this table is applied, and Codex terminates any
# command whose request its proxy blocks, even for 127.0.0.1. Chromium and Node
# therefore connect directly: the sandbox's network namespace has only its own
# loopback, so test pages' internet requests fail as on a disconnected machine
# while test servers inside the sandbox keep working. Chromium on Linux prefers
# auto_proxy to the *_proxy variables; this PAC answers DIRECT for every URL.
# Only Node versions that use NODE_USE_ENV_PROXY accept --no-use-env-proxy.
# PLAYWRIGHT_BROWSERS_PATH passes through so pre-installed browsers are found.
CODEX_COMMAND_ENV='auto_proxy="data:application/x-ns-proxy-autoconfig,function FindProxyForURL(url,host){return \"DIRECT\"}"'
if NODE_OPTIONS=--no-use-env-proxy node -e 0 >/dev/null 2>&1; then
    CODEX_COMMAND_ENV+=',NODE_OPTIONS="--no-use-env-proxy"'
fi
if [[ -n "${PLAYWRIGHT_BROWSERS_PATH:-}" ]]; then
    [[ "$PLAYWRIGHT_BROWSERS_PATH" =~ ^[A-Za-z0-9._/+@,:=-]+$ ]] \
        || die "PLAYWRIGHT_BROWSERS_PATH must be a path without spaces, quotes, or backslashes"
    CODEX_COMMAND_ENV+=",PLAYWRIGHT_BROWSERS_PATH=\"$PLAYWRIGHT_BROWSERS_PATH\""
fi

# Policy shared by agent sessions and the browser preflight's `codex sandbox`.
CODEX_POLICY_ARGS=(
    # Strict network_access=false denies socket calls Chromium cannot start
    # without (Crashpad setsockopt, sandbox-host shutdown). Use the enforced
    # proxy sandbox instead: its network namespace has no route out, its proxy
    # allows no destination, and Unix sockets cannot be created. Port 0 avoids
    # local listener conflicts. Full Chrome still needs a process-singleton Unix
    # socket, so browser tests use Playwright's bundled headless shell.
    -c 'sandbox_workspace_write.network_access=true'
    -c 'features.network_proxy={enabled=true,domains={},unix_sockets={},allow_upstream_proxy=false,allow_local_binding=false,dangerously_allow_non_loopback_proxy=false,dangerously_allow_all_unix_sockets=false,enable_socks5=false,enable_socks5_udp=false,proxy_url="http://127.0.0.1:0"}'
    -c 'web_search="disabled"'
    -c 'check_for_update_on_startup=false'
    -c 'analytics.enabled=false'
    -c 'shell_environment_policy.inherit="core"'
    -c 'shell_environment_policy.ignore_default_excludes=false'
    -c "shell_environment_policy.set={$CODEX_COMMAND_ENV}"
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

CODEX_SAFE_ARGS=(
    --ask-for-approval never
    exec
    --json
    --strict-config
    --ephemeral
    --ignore-user-config
    --ignore-rules
    --sandbox workspace-write
    "${CODEX_POLICY_ARGS[@]}"
)

if [[ -n "$CODEX_MODEL" ]]; then
    CODEX_SAFE_ARGS+=(--model "$CODEX_MODEL")
fi
if [[ -n "$CODEX_EFFORT" ]]; then
    CODEX_SAFE_ARGS+=(-c "model_reasoning_effort=\"$CODEX_EFFORT\"")
fi

# Logs live in this checkout's Git administrative directory, including linked
# worktrees. They cannot appear in git add -A and need no branch-specific ignore.
start_work_log() {
    local label="$1" description="$2" git_dir
    git_dir="$(git rev-parse --absolute-git-dir)" || die "Cannot locate log directory"
    mkdir -p "$git_dir/automation-logs" || die "Cannot create log directory"
    WORK_LOG="$(mktemp "$git_dir/automation-logs/$label-$(date +%Y%m%d-%H%M%S)-XXXXXX.log")" \
        || die "Cannot create work log"
    WORK_LOG_REPORTED=false
    trap 'finish_runner "$?"' EXIT
    printf '%s\nStarted: %s\nRepository: %s\nBranch: %s\n' \
        "$description" "$(date -Is)" "$REPO_ROOT" "${BRANCH:-}" >> "$WORK_LOG"
    printf '\n=== %s ===\nLog: %s\n' "$description" "$WORK_LOG"
}

work_status() {
    printf '%s\n' "$*"
    if [[ -n "${WORK_LOG:-}" ]]; then
        printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*" >> "$WORK_LOG"
    fi
}

log_error() {
    if [[ -n "${WORK_LOG:-}" ]]; then
        printf '\nERROR: %s\n' "$*" >> "$WORK_LOG"
        printf 'Log: %s\n' "$WORK_LOG" >&2
        WORK_LOG_REPORTED=true
    fi
}

finish_runner() {
    local status="$1"
    release_validation_evidence || status=1
    if [[ -n "${WORK_LOG:-}" ]]; then
        printf '\nFinished: %s (exit %s)\n' "$(date -Is)" "$status" >> "$WORK_LOG"
        if (( status != 0 )) && [[ "$WORK_LOG_REPORTED" != true ]]; then
            printf 'Stopped (exit %s). Log: %s\n' "$status" "$WORK_LOG" >&2
        fi
    fi
    return "$status"
}

# Keep Git transfer statistics, diffs, and other command details in the log.
# Run in a subshell so a trusted integrity rejection remains visible and stops
# the parent too; never bypass the existing git()/gh() integrity gates.
run_logged() {
    local status=0
    printf '\n[%s] ' "$(date +%H:%M:%S)" >> "$WORK_LOG"
    printf '%s ' "$@" >> "$WORK_LOG"
    printf '\n' >> "$WORK_LOG"
    ( "$@" ) >> "$WORK_LOG" 2>&1 || status=$?
    if (( status != 0 )); then
        # One bounded diagnostic, never a dump of command output or source.
        tail -n 1 "$WORK_LOG" | tr '\033\r' '  ' | cut -c1-240 >&2
        printf 'ERROR: %s failed (exit %s)\n' "$1" "$status" >&2
        log_error "$1 failed (exit $status)"
        exit "$status"
    fi
}

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
    local status delay events_pid events_input events_output parser_status output_file="" i attempt=0
    for (( i=0; i<${#args[@]}-1; i++ )); do
        if [[ "${args[i]}" == --output-last-message ]]; then
            output_file="${args[i+1]}"
        fi
    done
    while true; do
        attempt=$((attempt + 1))
        work_status "Working on assignment (attempt $attempt)..."
        assert_control_plane
        if [[ -n "$output_file" ]]; then
            : > "$output_file" || die "Cannot initialize final review output: $output_file"
        fi
        # Retry evidence stays in the pipe/trusted parser, never in the log.
        coproc CODEX_EVENTS {
            exec python3 -I "/proc/self/fd/$WRAPPER_CHECKER_FD" --codex-events "$CODEX_USAGE_RETRY_SECONDS" "$WORK_LOG"
        }
        events_pid=$CODEX_EVENTS_PID
        events_input=${CODEX_EVENTS[1]}
        events_output=${CODEX_EVENTS[0]}
        unset CODEX_EVENTS CODEX_EVENTS_PID
        status=0
        codex "${CODEX_SAFE_ARGS[@]}" "${args[@]}" </dev/null >&"$events_input" 2>>"$WORK_LOG" || status=$?
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
        work_status "Codex usage limit reached. Waiting $delay seconds before retrying the same assignment (Ctrl+C to stop)."
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

# Every agent prompt includes this. Repository docs show system Chrome for
# manual runs; inside the sandbox only the bundled headless shell can start.
CODEX_SANDBOX_GUIDANCE='SANDBOX AND BROWSER TESTS
Your commands run in a sandbox with no internet access and no access to host services.
Run Playwright tests with Playwright'"'"'s bundled headless Chromium: invoke them without
PW_CHROME_PATH, for example `node tests/wbstorefailure.js`. Notes in this repository
that show PW_CHROME_PATH=/usr/bin/google-chrome-stable describe manual runs outside this
sandbox; system Chrome cannot start here (its Unix socket setup is denied).
Browser and Node requests to the internet fail as on a disconnected machine, while local
test servers on 127.0.0.1 inside the sandbox work. Codex terminates any command that
sends traffic to its network proxy (curl, wget, pip, npm install and similar tools).
If a required browser test still cannot start, leave the item unchecked and report the
exact error.'

# Launch the bundled headless Chromium once under the agent command policy
# before any Git change, so a missing browser or an incompatible CLI sandbox
# stops the run instead of every agent session. `codex sandbox` cannot take
# exec's --sandbox option; this explicit profile is its workspace-write
# equivalent. tests/runner-browser-sandbox.js checks the real exec path.
BROWSER_SMOKE='
const { chromium } = require(process.argv[1]);
(async () => {
    const browser = await chromium.launch(process.env.PW_CHROME_PATH
        ? { executablePath: process.env.PW_CHROME_PATH } : {});
    try {
        const page = await browser.newPage();
        await page.goto("data:text/html,<title>runner browser preflight</title>");
        if (await page.title() !== "runner browser preflight") throw new Error("Unexpected page title");
    } finally {
        await browser.close();
    }
    console.log("BROWSER_PREFLIGHT_OK");
})().catch(error => { console.error(error.message); process.exit(1); });
'

preflight_browser() {
    [[ "$BROWSER_PREFLIGHT" == true ]] || return 0
    local output status=0 playwright="$REPO_ROOT/tests/node_modules/playwright"
    local install='cd tests && npm install && npx playwright install chromium-headless-shell'
    [[ -d "$playwright" ]] \
        || die "Browser preflight failed: Playwright is not installed; run: $install (or set BROWSER_PREFLIGHT=false for runs without browser tests)"
    printf 'Checking that browser tests can start in the Codex sandbox...\n'
    output="$(timeout 120 codex sandbox "${CODEX_POLICY_ARGS[@]}" \
        -c 'permissions.runner_browser={filesystem={":root"="read",":workspace_roots"="write",":tmpdir"="write","/tmp"="write"},network={enabled=true}}' \
        -P runner_browser -- node -e "$BROWSER_SMOKE" "$playwright" </dev/null 2>&1)" || status=$?
    if [[ "$status" != 0 || "${output##*$'\n'}" != BROWSER_PREFLIGHT_OK ]]; then
        printf '%s\n' "$output" | tail -n 12 >&2
        die "Browser preflight failed (exit $status); no Git changes were made. Playwright's bundled headless Chromium must start inside the Codex sandbox; install it with: $install (or set BROWSER_PREFLIGHT=false for runs without browser tests)"
    fi
}
