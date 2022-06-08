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
build windows amd64
build windows 386
build darwin amd64
build darwin arm64
