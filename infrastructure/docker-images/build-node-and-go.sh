#! /bin/bash

repo_root=$(dirname "$0")/../..
node_version=$(jq -r .engines.node "${repo_root}/package.json")
if [ -z "${node_version}" ]; then
    echo "Could not determine node version from top-level package.json"
    exit 1
fi

go_version=$(<${repo_root}/.go-version)
go_version=${go_version#go}
if [ -z "${go_version}" ]; then
    echo "Could not determine go version from top-level .go-version"
    exit 1
fi

tmpdir=$(mktemp -d)
trap "cd /; rm -rf ${tmpdir}" EXIT
cat > ${tmpdir}/Dockerfile <<EOF
FROM golang:${go_version}-stretch as golang
FROM node:${node_version}-stretch
COPY --from=golang /usr/local/go /usr/local/go
COPY --from=golang /go /go
ENV GOPATH /go
ENV PATH \$GOPATH/bin:/usr/local/go/bin:\$PATH
RUN curl -sfL https://install.goreleaser.com/github.com/golangci/golangci-lint.sh | sh -s -- -b \$GOPATH/bin v1.27.0
EOF

docker build -t "taskcluster/node-and-go:node${node_version}-go${go_version}" ${tmpdir}
[ -n "$DOCKER_PUSH" ] && docker push "taskcluster/node-and-go:node${node_version}-go${go_version}"
