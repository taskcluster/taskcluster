#! /bin/bash

build() {
    local output=start-worker-${1}-${2}
    GOOS="${1}" GOARCH="${2}" CGO_ENABLED=0 go build -o $output ./cmd/start-worker
    echo $output
}
echo "Building:"
build linux amd64
build windows amd64
build windows 386
build darwin amd64

