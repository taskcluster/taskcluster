#!/bin/bash

repo_root=$(dirname "$0")/../..
NODE_VERSION=$(jq -r .engines.node "${repo_root}/package.json")
if [ -z "${NODE_VERSION}" ]; then
    echo "Could not determine node version from top-level package.json"
    exit 1
fi

tag="taskcluster/worker-ci:node${NODE_VERSION}"

docker build --platform linux/amd64 --build-arg NODE_VERSION=$NODE_VERSION -t ${tag}  ./worker-ci
[ -n "$DOCKER_PUSH" ] && docker push ${tag}
