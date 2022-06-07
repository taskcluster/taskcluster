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
FROM node:${node_version}-stretch
RUN apt-get update && apt-get install -y rabbitmq-server
EOF

docker build --platform linux/amd64 -t "taskcluster/rabbit-test:${node_version}" ${tmpdir}
[ -n "$DOCKER_PUSH" ] && docker push "taskcluster/rabbit-test:${node_version}"
