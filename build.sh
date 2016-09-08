#!/bin/bash -ev

cd "$(dirname "${0}")"

# need to use go 1.7 or later, see e.g.
# https://github.com/contester/runlib/issues/5

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

function install {
  # GOOS="${1}" GOARCH="${2}" go get -u ./...
  GOOS="${1}" GOARCH="${2}" go get ./...
  GOOS="${1}" GOARCH="${2}" go vet ./...
}

# build windows first
install windows 386
install windows amd64

# now the rest
install darwin 386
install darwin amd64
install dragonfly amd64
install freebsd 386
install freebsd amd64
install freebsd arm
install linux 386
install linux amd64
install linux arm
install netbsd 386
install netbsd amd64
install netbsd arm
install openbsd 386
install openbsd amd64
# install plan9 386
# install plan9 amd64
install solaris amd64

find "${GOPATH}/bin" -name 'generic-worker*'

go test -v ./...
go vet ./...
golint ./...

echo "Build successful!"
