#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/upgrade-node.sh [options]

Fetch, install, and apply a Node.js version upgrade using nvm.

Defaults:
  --node latest
  --corepack auto

Options:
  --node <latest|VERSION>
      Node.js version to use. latest means the latest Node LTS. VERSION may
      include a leading "v".
  --corepack <auto|latest|skip|VERSION>
      corepack version to write to .corepack-version. In auto mode, this
      updates to the latest release when Node.js changes and otherwise keeps
      the current pinned version. VERSION may include a leading "v".
  --yes
      Do not prompt before continuing with a dirty working tree.
  --dry-run
      Resolve versions and print the commands that would run without modifying
      files or installing tools.
  -h, --help
      Show this help.

Examples:
  scripts/upgrade-node.sh
  scripts/upgrade-node.sh --node 24.15.0
  scripts/upgrade-node.sh --node latest --dry-run
  scripts/upgrade-node.sh --node 26.13.0 --corepack latest
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

load_nvm() {
  if command -v nvm >/dev/null 2>&1; then
    return
  fi

  export NVM_DIR="${NVM_DIR:-${HOME}/.nvm}"
  if [[ -s "${NVM_DIR}/nvm.sh" ]]; then
    set +u
    # shellcheck disable=SC1091
    . "${NVM_DIR}/nvm.sh"
    set -u
  fi

  command -v nvm >/dev/null 2>&1 || die "nvm is not available. Install nvm or set NVM_DIR."
}

nvm_cmd() {
  set +u
  nvm "$@"
  local status=$?
  set -u
  return "${status}"
}

run_node_env() {
  node infrastructure/tooling/src/main.js upgrade:node:prepare-shell "$@"
}

shell_env="$(run_node_env "$@")"
eval "${shell_env}"

if [[ "${UPGRADE_NODE_CHANGED}" != "1" && "${UPGRADE_COREPACK_CHANGED}" != "1" ]]; then
  exit 0
fi

if [[ "${UPGRADE_NODE_CHANGED}" == "1" ]]; then
  if [[ "${UPGRADE_DRY_RUN}" == "1" ]]; then
    log "+ nvm install ${UPGRADE_NODE_TARGET}"
    log "+ nvm use ${UPGRADE_NODE_TARGET}"
  else
    load_nvm
    log "+ nvm install ${UPGRADE_NODE_TARGET}"
    nvm_cmd install "${UPGRADE_NODE_TARGET}"
    log "+ nvm use ${UPGRADE_NODE_TARGET}"
    nvm_cmd use "${UPGRADE_NODE_TARGET}"
  fi
fi

# Node.js stopped bundling corepack in v25
log "+ npm install -g corepack@${UPGRADE_COREPACK_TARGET}"
if [[ "${UPGRADE_DRY_RUN}" != "1" ]]; then
  npm install -g "corepack@${UPGRADE_COREPACK_TARGET}"
fi

apply_args=(
  upgrade:node:apply
  --target-node "${UPGRADE_NODE_TARGET}"
  --target-corepack "${UPGRADE_COREPACK_TARGET}"
)

if [[ "${UPGRADE_NODE_CHANGED}" == "1" ]]; then
  apply_args+=(--node-changed)
fi

if [[ "${UPGRADE_COREPACK_CHANGED}" == "1" ]]; then
  apply_args+=(--corepack-changed)
fi

if [[ "${UPGRADE_DRY_RUN}" == "1" ]]; then
  apply_args+=(--dry-run)
fi

node infrastructure/tooling/src/main.js "${apply_args[@]}"
