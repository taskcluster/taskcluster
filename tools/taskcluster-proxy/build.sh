#!/bin/bash -e

cd "$(dirname "${0}")"

# Support go 1 release 1.13 or higher
GO_MAJOR_VERSION=1
MIN_GO_MINOR_VERSION=13

unset CGO_ENABLED
unset GOOS
GO_VERSION="$(go version 2>/dev/null | cut -f3 -d' ')"
GO_MAJ="$(echo "${GO_VERSION}" | cut -f1 -d'.')"
GO_MIN="$(echo "${GO_VERSION}" | cut -f2 -d'.')"
if [ -z "${GO_VERSION}" ]; then
  echo "Have you installed go? I get no result from \`go version\` command." >&2
  exit 64
elif [ "${GO_MAJ}" != "go${GO_MAJOR_VERSION}" ] || [ "${GO_MIN}" -lt "${MIN_GO_MINOR_VERSION}" ]; then
  echo "Go version go${GO_MAJOR_VERSION}.x needed, where x >= ${MIN_GO_MINOR_VERSION}, but the version I found is: '${GO_VERSION}'" >&2
  echo "I found it here:" >&2
  which go >&2
  echo "The complete output of \`go version\` command is:" >&2
  go version >&2
  exit 65
fi
echo "Go version ok (${GO_VERSION} >= go${GO_MAJOR_VERSION}.${MIN_GO_MINOR_VERSION})"
TEST=false
OUTPUT_ALL_PLATFORMS="Building just for the native platform (build.sh -a argument NOT specified)"
OUTPUT_TEST="Test flag NOT detected (-t) as argument to build.sh script"
ALL_PLATFORMS=false
while getopts ":at" opt; do
    case "${opt}" in
        a)  ALL_PLATFORMS=true
            OUTPUT_ALL_PLATFORMS="Building for all platforms (build.sh -a argument specified)"
            ;;
        t)  TEST=true
            OUTPUT_TEST="Test flag detected (-t) as build.sh argument"
            ;;
    esac
done
echo "${OUTPUT_ALL_PLATFORMS}"
echo "${OUTPUT_TEST}"

function install {
  if [ "${1}" != 'native' ]; then
    GOOS="${1}" GOARCH="${2}" go get -ldflags "-X main.revision=$(git rev-parse HEAD)" -v ./...
    GOOS="${1}" GOARCH="${2}" go vet ./...
    # note, this just builds tests, it doesn't run them!
    GOOS="${1}" GOARCH="${2}" go test -c github.com/taskcluster/taskcluster/v95/tools/taskcluster-proxy
  else
    go get -ldflags "-X main.revision=$(git rev-parse HEAD)" -v ./...
    go vet ./...
    # note, this just builds tests, it doesn't run them!
    go test -c github.com/taskcluster/taskcluster/v95/tools/taskcluster-proxy
  fi
}

if ${ALL_PLATFORMS}; then
  # build windows first
  install windows arm64
  install windows amd64
  # darwin
  install darwin     amd64
  install darwin     arm64
  # linux
  install linux      amd64
  install linux      arm64
  # freebsd
  install freebsd    amd64
  install freebsd    arm64
else
  install native
fi

find "${GOPATH}/bin" -name 'taskcluster-proxy*'

if $TEST; then
  CGO_ENABLED=1 GORACE="history_size=7" go test -v -ldflags "-X github.com/taskcluster/taskcluster.revision=$(git rev-parse HEAD)" -race -timeout 1h ./...
fi
go vet ./...
golint ./...
go get github.com/gordonklaus/ineffassign
ineffassign .

echo "Build successful!"
git status
