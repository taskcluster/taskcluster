#!/bin/bash -e

cd "$(dirname "${0}")"

# Support go 1 release 1.10 or higher
GO_MAJOR_VERSION=1
MIN_GO_MINOR_VERSION=10

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

go get github.com/taskcluster/generic-worker/gw-codegen
go generate ./...

function install {
  if [ "${1}" != 'native' ]; then
    GOOS="${1}" GOARCH="${2}" go get -ldflags "-X main.revision=$(git rev-parse HEAD)" -v ./...
    GOOS="${1}" GOARCH="${2}" go vet ./...
    # note, this just builds tests, it doesn't run them!
    GOOS="${1}" GOARCH="${2}" go test -c github.com/taskcluster/generic-worker
    GOOS="${1}" GOARCH="${2}" go test -c github.com/taskcluster/generic-worker/livelog
  else
    go get -ldflags "-X main.revision=$(git rev-parse HEAD)" -v ./...
    go vet ./...
    # note, this just builds tests, it doesn't run them!
    go test -c github.com/taskcluster/generic-worker
    go test -c github.com/taskcluster/generic-worker/livelog
  fi
}

if ${ALL_PLATFORMS}; then
  # build windows first
  install windows 386
  install windows amd64
  # darwin
  install darwin     386
  install darwin     amd64
  # linux
  install linux      386
  install linux      amd64
else
  install native
fi

# now the rest
## install android    arm
##install darwin     arm
##install darwin     arm64
#install dragonfly  amd64
#install freebsd    386
#install freebsd    amd64
#install freebsd    arm
#install linux      arm
#install linux      arm64
#install linux      ppc64
#install linux      ppc64le
#install linux      mips64
#install linux      mips64le
#install netbsd     386
#install netbsd     amd64
#install netbsd     arm
#install openbsd    386
#install openbsd    amd64
#install openbsd    arm
##install plan9      386
##install plan9      amd64
#install solaris    amd64

find "${GOPATH}/bin" -name 'generic-worker*'

go get github.com/taskcluster/livelog
# capital X here ... we only want to delete things that are ignored!
git clean -fdX

if $TEST; then
  CGO_ENABLED=1 GORACE="history_size=7" go test -ldflags "-X github.com/taskcluster/generic-worker.revision=$(git rev-parse HEAD)" -race -timeout 1h ./...
fi
go vet ./...
golint ./...
go get github.com/gordonklaus/ineffassign
ineffassign .

echo "Build successful!"
git status
