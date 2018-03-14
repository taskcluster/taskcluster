#!/bin/bash

REPORT="${1}"
if [ -z "${REPORT}" ]; then
  echo "Specify a report, e.g. '${0}' myreport.txt" >&2
  exit 64
fi
cd "$(dirname "${0}")"
TEMP_SINGLE_REPORT="$(mktemp -t coverage.tmp.XXXXXXXXXX)"
echo "mode: atomic" > "${REPORT}"
HEAD_REV="$(git rev-parse HEAD)"
go list ./... | while read package
do
  CGO_ENABLED=1 go test -ldflags "-X github.com/taskcluster/generic-worker.revision=${HEAD_REV}" -race -timeout 1h -covermode=atomic "-coverprofile=${TEMP_SINGLE_REPORT}" "${package}"
  if [ -f "${TEMP_SINGLE_REPORT}" ]; then
    sed 1d "${TEMP_SINGLE_REPORT}" >> "${REPORT}"
    rm "${TEMP_SINGLE_REPORT}"
  fi
done
