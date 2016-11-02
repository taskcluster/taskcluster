#!/bin/bash

cd "$(dirname "${0}")"

go run all-worker-types/main.go
ALL_REFERENCED_AMIS="$(cat worker_type_definitions/* | sed -n 's/^[[:space:]]*"ImageId": "//p' | sed -n 's/".*//p' | sort -u)"
rm -r worker_type_definitions
echo "All referenced amis: ${ALL_REFERENCED_AMIS}"
