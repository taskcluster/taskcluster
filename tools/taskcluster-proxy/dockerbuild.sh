#!/bin/bash

set -e

outdir="./"

if ! test -z "$1"; then
  outdir=$1
fi

build() {
  local output=taskcluster-proxy-${1}-${2}
  GOOS="${1}" GOARCH="${2}" CGO_ENABLED=0 go build -ldflags "-X main.revision=$(git rev-parse HEAD)" -o $outdir/$output .
  echo $output
}

echo "Building tc-proxy:"
build windows arm64
build windows amd64
build darwin amd64
build darwin arm64
build linux amd64
build linux arm64
build freebsd amd64
build freebsd arm64
