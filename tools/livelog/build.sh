#!/bin/bash

outdir="./"

if ! test -z "$1"; then
    outdir=$1
fi

build() {
    local output=livelog-${1}-${2}
    GOOS="${1}" GOARCH="${2}" CGO_ENABLED=0 go build -o $outdir/$output .
    echo $output
}

echo "Building livelog:"
build linux amd64
build linux arm64
build windows amd64
build windows arm64
build darwin amd64
build darwin arm64
build freebsd amd64
build freebsd arm64
