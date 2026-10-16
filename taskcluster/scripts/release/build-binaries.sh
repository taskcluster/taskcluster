#!/usr/bin/env bash
# Build one set of release binaries, npm tarballs, Python packages or Rust crates into release-out/.
# Run from the repository root.
set -euo pipefail

target="${1:?usage: build-binaries.sh <target>}"
out="$(pwd)/release-out"
mkdir -p "$out"

case "$target" in
  generic-worker)
    (cd workers/generic-worker && ./build.sh -p -o "$out")
    ;;
  worker-runner)
    (cd tools/worker-runner && ./build.sh "$out")
    ;;
  livelog)
    (cd tools/livelog && ./build.sh "$out")
    ;;
  taskcluster-proxy)
    (cd tools/taskcluster-proxy && ./dockerbuild.sh "$out")
    ;;
  client-shell)
    # Staging checkouts carry a local (never pushed) release tag, so goreleaser
    # runs in release mode there too. Publishing (including the Homebrew tap)
    # is always skipped here: publish-homebrew commits the cask only after the
    # GitHub release is public.
    go tool goreleaser release --clean --skip=publish,announce
    mv dist/taskcluster-*.tar.gz dist/taskcluster-*.zip "$out/"
    test -f dist/homebrew/Casks/taskcluster.rb
    ;;
  npm-client)
    (cd clients/client && mv "$(npm pack | tail -1)" "$out/")
    ;;
  npm-client-web)
    (cd clients/client-web && yarn install && mv "$(npm pack | tail -1)" "$out/")
    ;;
  python-client)
    # Built here, before the release gate, so a broken build cannot leave the
    # release half published; publish-pypi.sh uploads exactly these files.
    : "${RELEASE_VERSION:?}"
    dist="$(mktemp -d)"
    trap 'rm -rf "$dist"' EXIT
    (cd clients/client-py && uv build --out-dir "$dist")
    # Exactly the sdist and one wheel for RELEASE_VERSION; anything else usually
    # means pyproject.toml's version doesn't match the release version.
    sdist="taskcluster-${RELEASE_VERSION}.tar.gz"
    wheels=("$dist"/taskcluster-"${RELEASE_VERSION}"-*.whl)
    built=("$dist"/*)
    if [ ! -f "$dist/$sdist" ] || [ "${#wheels[@]}" -ne 1 ] || [ ! -f "${wheels[0]}" ] || [ "${#built[@]}" -ne 2 ]; then
      echo "built files [${built[*]}] do not match expected [$sdist, taskcluster-${RELEASE_VERSION}-*.whl]" >&2
      exit 1
    fi
    tar -czf "$out/python-client-dist.tar.gz" -C "$dist" "$sdist" "${wheels[0]##*/}"
    ;;
  rust-client)
    # Package the crates and build each one from its packaged files, before the
    # release gate; publish-crates.sh then publishes with --no-verify. One
    # multi-package run, so the dependent crates resolve taskcluster@RELEASE_VERSION
    # from the local package rather than crates.io.
    (cd clients/client-rust && cargo package --locked -p taskcluster -p taskcluster-download -p taskcluster-upload)
    mv clients/client-rust/target/package/*.crate "$out/"
    ;;
  *)
    echo "unknown target $target" >&2
    exit 1
    ;;
esac

ls -l "$out"
