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
build windows 386
build windows amd64
build darwin amd64
build darwin arm64
build linux 386
build linux amd64
build linux arm
build linux arm64
