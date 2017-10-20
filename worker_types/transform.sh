#!/bin/bash -e
cd "$(dirname "${0}")"

echo "${1}"
mkdir -p "${1}"
go run transform-occ/main.go "${1}" > "${1}/userdata" || rm "${1}/userdata"
