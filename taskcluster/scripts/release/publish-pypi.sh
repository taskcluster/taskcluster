#!/usr/bin/env bash
# Upload the Python client built by release-build-python-client to PyPI (a dry
# run when STAGING=1). The task mounts those packages in ../python-client-dist.
# Reruns are safe: files PyPI already has are not uploaded again.
# Run from the repository root.
set -euo pipefail

: "${RELEASE_VERSION:?}"
secret="$(pwd)/taskcluster/scripts/release/release-secret.sh"
dist="$(cd .. && pwd)/python-client-dist"

# build-binaries.sh python-client checked these are the only two files.
sdist="$dist/taskcluster-${RELEASE_VERSION}.tar.gz"
wheels=("$dist"/taskcluster-"${RELEASE_VERSION}"-*.whl)
if [ ! -f "$sdist" ] || [ "${#wheels[@]}" -ne 1 ] || [ ! -f "${wheels[0]}" ]; then
  echo "$dist does not contain the sdist and wheel for $RELEASE_VERSION" >&2
  exit 1
fi

if [ "${STAGING:-}" = 1 ]; then
  echo "would upload $sdist ${wheels[0]}"
  echo "publish-pypi: dry-run"
  exit 0
fi

# Ask PyPI which of this release's files it already has.
resp="$(curl -sS --retry 3 --max-time 60 -w '\n%{http_code}' "https://pypi.org/pypi/taskcluster/${RELEASE_VERSION}/json")"
status="${resp##*$'\n'}"
body="${resp%$'\n'*}"
existing=""
case "$status" in
  200) existing="$(python3 -c 'import json,sys; print("\n".join(u["filename"] for u in json.load(sys.stdin)["urls"]))' <<<"$body")" ;;
  404) ;;
  *) echo "pypi.org returned $status for taskcluster $RELEASE_VERSION" >&2; exit 1 ;;
esac

todo=()
for f in "$sdist" "${wheels[0]}"; do
  if grep -qxF "${f##*/}" <<<"$existing"; then
    echo "${f##*/} is already on PyPI, skipping"
  else
    todo+=("$f")
  fi
done
if [ "${#todo[@]}" -eq 0 ]; then
  echo "publish-pypi: already published"
  exit 0
fi

username="$("$secret" PYPI_USERNAME)"
password="$("$secret" PYPI_PASSWORD)"
UV_PUBLISH_USERNAME="$username" UV_PUBLISH_PASSWORD="$password" \
  uv publish --publish-url https://upload.pypi.org/legacy/ --check-url https://pypi.org/simple/ \
  "${todo[@]}"
echo "publish-pypi: published"
