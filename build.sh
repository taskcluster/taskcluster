#!/bin/bash -ev

cd "$(dirname "${0}")"

function install {
  GOOS="${1}" GOARCH="${2}" go install ./...
  GOOS="${1}" GOARCH="${2}" go vet ./...
}

# build windows first
install windows 386
install windows amd64

# now the rest
install darwin 386
install darwin amd64
install dragonfly 386
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
install plan9 386
install plan9 amd64
install solaris amd64

find "${GOPATH}/bin" -name 'generic-worker*'

go test ./...

echo "Build successful!"
