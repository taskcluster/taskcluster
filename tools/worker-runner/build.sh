#!/bin/bash -e

outdir="./"

if [ -n "${1}" ]; then
    outdir="${1}"
fi

build() {
    local filename="start-worker-${1}-${2}"
    GOOS="${1}" GOARCH="${2}" CGO_ENABLED=0 go build -o "${outdir}/${filename}" "$(dirname "${0}")/cmd/start-worker"
    echo "${filename}"
}

echo "Building worker-runner:"
build linux amd64
build linux arm64
build windows amd64
build windows 386
build darwin amd64
build darwin arm64
build freebsd amd64
build freebsd arm64
