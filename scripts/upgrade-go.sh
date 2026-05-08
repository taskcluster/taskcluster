#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/upgrade-go.sh [options]

Fetch, install, and apply a Go version upgrade using gvm.

Defaults:
  --go latest
  --golangci-lint auto

Options:
  --go <latest|VERSION>
      Go version to use. VERSION may include or omit the "go" prefix.
  --golangci-lint <auto|latest|skip|VERSION>
      golangci-lint version to write to .golangci-lint-version. In auto mode,
      this updates to the latest release when Go changes and otherwise keeps
      the current pinned version. VERSION may include a leading "v".
  --yes
      Do not prompt before continuing with a dirty working tree.
  --dry-run
      Resolve versions and print the commands that would run without modifying
      files or installing tools.
  -h, --help
      Show this help.

Examples:
  scripts/upgrade-go.sh
  scripts/upgrade-go.sh --go go1.26.2
  scripts/upgrade-go.sh --go latest --golangci-lint latest --dry-run
EOF
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${repo_root}"

case "${1:-}" in
  -h|--help)
    usage
    exit 0
    ;;
esac

log() {
  printf '%s\n' "$*"
}

die() {
  echo "error: $*" >&2
  exit 1
}

load_gvm() {
  local gvm_script="${GVM_ROOT:-${HOME}/.gvm}/scripts/gvm"
  if [[ -s "${gvm_script}" ]]; then
    set +u
    # shellcheck disable=SC1090
    . "${gvm_script}"
    set -u
  fi

  command -v gvm >/dev/null 2>&1 || die "gvm is not available. Install gvm or set GVM_ROOT."

  local gvm_type
  gvm_type="$(type -t gvm || true)"
  [[ "${gvm_type}" == "function" ]] || die "gvm shell function is not available. Source ${gvm_script} or set GVM_ROOT so this script can use 'gvm use'."
}

gvm_cmd() {
  set +u
  gvm "$@"
  local status=$?
  set -u
  return "${status}"
}

run_go_env() {
  node infrastructure/tooling/src/main.js upgrade:go:prepare-shell "$@"
}

shell_env="$(run_go_env "$@")"
eval "${shell_env}"

if [[ "${UPGRADE_GO_CHANGED}" != "1" && "${UPGRADE_GOLANGCI_LINT_CHANGED}" != "1" ]]; then
  exit 0
fi

if [[ "${UPGRADE_GO_CHANGED}" == "1" ]]; then
  if [[ "${UPGRADE_DRY_RUN}" == "1" ]]; then
    log "+ gvm install ${UPGRADE_GO_TARGET}"
    log "+ gvm use ${UPGRADE_GO_TARGET}"
  else
    load_gvm
    if gvm_cmd list 2>/dev/null | grep -Eq "(^|[[:space:]])${UPGRADE_GO_TARGET}([[:space:]]|$)"; then
      log "${UPGRADE_GO_TARGET} is already installed in gvm"
    else
      log "+ gvm install ${UPGRADE_GO_TARGET}"
      gvm_cmd install "${UPGRADE_GO_TARGET}"
    fi
    log "+ gvm use ${UPGRADE_GO_TARGET}"
    gvm_cmd use "${UPGRADE_GO_TARGET}"
    hash -r 2>/dev/null || true
  fi
fi

apply_args=(
  upgrade:go:apply
  --target-go "${UPGRADE_GO_TARGET}"
  --target-golangci-lint "${UPGRADE_GOLANGCI_LINT_TARGET}"
)

if [[ "${UPGRADE_GO_CHANGED}" == "1" ]]; then
  apply_args+=(--go-changed)
fi

if [[ "${UPGRADE_GOLANGCI_LINT_CHANGED}" == "1" ]]; then
  apply_args+=(--golangci-lint-changed)
fi

if [[ "${UPGRADE_DRY_RUN}" == "1" ]]; then
  apply_args+=(--dry-run)
fi

node infrastructure/tooling/src/main.js "${apply_args[@]}"
