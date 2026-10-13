#!/usr/bin/env bash
# Publish the Rust client crates to crates.io (a dry run when STAGING=1).
# Reruns are safe: crates whose version crates.io already has are skipped.
# Run from the repository root.
set -euo pipefail

: "${RELEASE_VERSION:?}"
secret="$(pwd)/taskcluster/scripts/release/release-secret.sh"
# dependency order: download and upload depend on taskcluster
crates=(taskcluster taskcluster-download taskcluster-upload)

cd clients/client-rust

if [ "${STAGING:-}" = 1 ]; then
  # One multi-package run: the dependent crates need taskcluster@RELEASE_VERSION,
  # which only resolves when packaged together with it.
  cargo publish --dry-run --no-verify -p taskcluster -p taskcluster-download -p taskcluster-upload
  echo "publish-crates: dry-run"
  exit 0
fi

token="$("$secret" CRATESIO_TOKEN)"
skipped=()
for crate in "${crates[@]}"; do
  status="$(curl -sS -o /dev/null -w '%{http_code}' --retry 3 --max-time 60 \
    -A 'taskcluster-release (taskcluster-notifications@mozilla.com)' \
    "https://crates.io/api/v1/crates/$crate/$RELEASE_VERSION")"
  case "$status" in
    200) skipped+=("$crate"); continue ;;
    404) ;;
    *) echo "crates.io returned $status for $crate $RELEASE_VERSION" >&2; exit 1 ;;
  esac
  # cargo waits for the crate to appear in the index before returning
  CARGO_REGISTRY_TOKEN="$token" cargo publish --no-verify -p "$crate"
done
echo "publish-crates: published${skipped[*]:+ (already on crates.io: ${skipped[*]})}"
