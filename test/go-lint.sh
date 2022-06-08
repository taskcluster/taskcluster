#!/bin/bash

echo "Running gofmt.."
unformatted_files=$(git ls-files | grep '\.go$' | xargs gofmt -l)
if [ -n "${unformatted_files}" ]; then
    echo 'Go files not formatted with gofmt:'
    echo "${unformatted_files}"
    exit 1;
fi

echo "Running golangci-lint.."
golangci-lint run --build-tags multiuser
