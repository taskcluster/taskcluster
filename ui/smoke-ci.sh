#!/bin/bash
# Boot the UI dev server and run Playwright smoke tests against it.
# Used by taskcluster CI; runs on port 5081 so it doesn't collide
# with a local `yarn start` on the default 5080.

set -euo pipefail

: "${TASKCLUSTER_ROOT_URL:=https://community-tc.services.mozilla.com}"
: "${PORT:=5081}"
export TASKCLUSTER_ROOT_URL PORT

cleanup() {
  if [[ -n "${DEV_PID:-}" ]]; then
    pkill -P "$DEV_PID" 2>/dev/null || true
    kill "$DEV_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

DEV_LOG=/tmp/dev-server.log
yarn start > "$DEV_LOG" 2>&1 &
DEV_PID=$!

# Wait for the initial webpack build to finish, not just for the port
# to open — webpack-dev-server starts serving before all chunks are
# emitted, which races the smoke harness on a cold CI worker.
timeout 300 bash -c "until grep -q 'Compiled successfully' '$DEV_LOG'; do sleep 2; done"

BASE_URL="http://localhost:${PORT}" yarn smoke
