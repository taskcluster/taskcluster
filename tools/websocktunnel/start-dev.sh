#!/bin/bash

set -e

# Disables syslog/json log formatting - output will be human readable text on stdout
ENV="localdev"
TASKCLUSTER_PROXY_SECRET_A="foobar"
TASKCLUSTER_PROXY_SECRET_B="barfoo"
PORT="1080"
URL_PREFIX="http://localhost:${PORT}"

CGO_ENABLED=0 go build -o . ./cmd/websocktunnel

docker build -t websocktunnel:dev .

docker run --rm \
    -e URL_PREFIX="${URL_PREFIX}" \
    -e ENV="${ENV}" \
    -e TASKCLUSTER_PROXY_SECRET_A="${TASKCLUSTER_PROXY_SECRET_A}" \
    -e TASKCLUSTER_PROXY_SECRET_B="${TASKCLUSTER_PROXY_SECRET_B}" \
    -e PORT="${PORT}" \
    -p "${PORT}:${PORT}" \
    -it \
    websocktunnel:dev
