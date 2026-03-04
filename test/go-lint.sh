#!/bin/bash

set -e

echo "Running gofmt.."
unformatted_files=$(git ls-files | grep '\.go$' | xargs gofmt -l)
if [ -n "${unformatted_files}" ]; then
    echo 'Go files not formatted with gofmt:'
    echo "${unformatted_files}"
    exit 1;
fi

for engine in multiuser insecure; do
  echo "Running golangci-lint for ${engine} engine.."
  golangci-lint run --build-tags "${engine}" --timeout=5m
done
