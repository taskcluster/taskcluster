#!/bin/bash

repo_root=$(dirname "$0")/../..
node_version=$(jq -r .engines.node "${repo_root}/package.json")
if [ -z "${node_version}" ]; then
    echo "Could not determine node version from top-level package.json"
    exit 1
fi


tmpdir=$(mktemp -d)
trap "cd /; rm -rf ${tmpdir}" EXIT
cat > ${tmpdir}/Dockerfile <<EOF
FROM node:${node_version}-buster
RUN apt-get update && apt-get install -y firefox-esr xvfb
EOF

docker buildx build $DOCKER_PUSH --platform linux/arm/v7,linux/arm64,linux/amd64 -t "taskcluster/browser-test:${node_version}" ${tmpdir}
