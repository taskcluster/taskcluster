#!/bin/bash

echo "Running gofmt.."
unformatted_files=$(git ls-files | grep '\.go$' | xargs gofmt -l)
if [ -n "${unformatted_files}" ]; then
    echo 'Go files not formatted with gofmt:'
    echo "${unformatted_files}"
    exit 1;
fi

for engine in multiuser simple; do
  echo "Running golangci-lint for ${engine} engine.."
  golangci-lint run --build-tags "${engine}"
done
