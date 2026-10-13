#!/usr/bin/env bash
# Build one release Docker image and save it as task artifacts:
#   release-out/<name>.tar.gz   docker-save archive, gzip-compressed (gzip is always present;
#                               zstd is not guaranteed on the worker image)
#   release-out/<name>.digest   image config digest (sha256:...), compared by push-image.
#                               Read from the archive's manifest.json, NOT `docker inspect .Id`:
#                               with the containerd image store (Docker 29 default) .Id is the
#                               manifest digest, not the config digest.
#   release-out/<name>.tag      full tag the image is pushed as
# Run from the repository root.
set -euo pipefail

name="${1:?usage: build-image.sh <name>}"
: "${RELEASE_VERSION:?}" "${TASK_ID:?}" "${TASKCLUSTER_ROOT_URL:?}"

out="$(pwd)/release-out"
mkdir -p "$out"
version_json="$(printf '{"version": "%s", "commit": "%s", "source": "https://github.com/taskcluster/taskcluster", "build": "%s/tasks/%s"}' \
  "$RELEASE_VERSION" "$(git rev-parse HEAD)" "$TASKCLUSTER_ROOT_URL" "$TASK_ID")"

# Package a static Go binary into one of the scratch images in infrastructure/docker.
scratch_image() {
  local binary="$1" pkg="$2"
  local ctx
  ctx="$(mktemp -d)"
  # expand now: ctx is local, so it is out of scope when the EXIT trap runs
  # shellcheck disable=SC2064
  trap "rm -rf -- '$ctx'" EXIT
  cp "infrastructure/docker/$binary/Dockerfile" "$ctx/"
  printf '%s' "$version_json" > "$ctx/version.json"
  CGO_ENABLED=0 go build -o "$ctx/$binary" "$pkg"
  docker build --no-cache --progress plain --tag "$tag" "$ctx"
}

case "$name" in
  monoimage)
    tag="taskcluster/taskcluster:v$RELEASE_VERSION"
    DOCKER_BUILDKIT=1 docker build --no-cache --progress plain --tag "$tag" \
      --build-arg "DOCKER_FLOW_VERSION=$version_json" .
    ;;
  monoimage-devel)
    base="taskcluster/taskcluster:v$RELEASE_VERSION"
    tag="$base-devel"
    docker load -i ../monoimage.tar.gz
    docker build --no-cache --progress plain --build-arg "BASE=$base" --tag "$tag" \
      infrastructure/docker/monoimage-devel
    ;;
  generic-worker)
    tag="taskcluster/generic-worker:v$RELEASE_VERSION"
    DOCKER_BUILDKIT=1 docker build --no-cache --progress plain -f generic-worker.Dockerfile \
      --tag "$tag" --build-arg "DOCKER_FLOW_VERSION=$version_json" .
    ;;
  livelog)
    tag="taskcluster/livelog:v$RELEASE_VERSION"
    scratch_image livelog ./tools/livelog
    ;;
  taskcluster-proxy)
    tag="taskcluster/taskcluster-proxy:v$RELEASE_VERSION"
    scratch_image taskcluster-proxy ./tools/taskcluster-proxy
    ;;
  websocktunnel)
    tag="taskcluster/websocktunnel:v$RELEASE_VERSION"
    scratch_image websocktunnel ./tools/websocktunnel/cmd/websocktunnel
    ;;
  *)
    echo "unknown image $name" >&2
    exit 1
    ;;
esac

docker save -o "$out/$name.tar" "$tag"
config="$(tar -xOf "$out/$name.tar" manifest.json | python3 -c 'import json,sys; sys.stdout.write(json.load(sys.stdin)[0]["Config"])')"
echo "sha256:$(tar -xOf "$out/$name.tar" "$config" | sha256sum | cut -d' ' -f1)" > "$out/$name.digest"
gzip -1 "$out/$name.tar"
echo "$tag" > "$out/$name.tag"
echo "built $tag ($(cat "$out/$name.digest"))"
