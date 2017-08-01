#!/bin/bash -evx

cd "$(dirname "${0}")"

# need to use go 1.7 or later, see e.g.
# https://github.com/contester/runlib/issues/5

unset CGO_ENABLED
unset GOOS
GO_VERSION="$(go version 2>/dev/null | cut -f3 -d' ')"
GO_MAJ="$(echo "${GO_VERSION}" | cut -f1 -d'.')"
GO_MIN="$(echo "${GO_VERSION}" | cut -f2 -d'.')"
if [ -z "${GO_VERSION}" ]; then
  echo "Have you installed go? I get no result from \`go version\` command." >&2
  exit 64
elif [ "${GO_MAJ}" != "go1" ] || [ "${GO_MIN}" -lt 7 ]; then
  echo "Go version go1.x needed, where x >= 7, but the version I found is: '${GO_VERSION}'" >&2
  echo "I found it here:" >&2
  which go >&2
  echo "The complete output of \`go version\` command is:" >&2
  go version >&2
  exit 65
fi

go get github.com/taskcluster/generic-worker/gw-codegen
go generate ./...

function install {
  # GOOS="${1}" GOARCH="${2}" go get -u ./...
  GOOS="${1}" GOARCH="${2}" go get -v ./...
  GOOS="${1}" GOARCH="${2}" go vet ./...
  # note, this just builds tests, it doesn't run them!
  GOOS="${1}" GOARCH="${2}" go test -c github.com/taskcluster/generic-worker
  GOOS="${1}" GOARCH="${2}" go test -c github.com/taskcluster/generic-worker/livelog
}

# build windows first
install windows 386
install windows amd64
# darwin
install darwin     386
install darwin     amd64
# linux
install linux      386
install linux      amd64

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

CGO_ENABLED=1 GORACE="history_size=7" go test -race -timeout 1h ./...
go vet ./...
golint ./...
go get github.com/gordonklaus/ineffassign
ineffassign .

echo "Build successful!"
git status
