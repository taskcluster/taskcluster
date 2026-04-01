#!/usr/bin/env bash

set -exv

# This script is needed because `go test -covermode=atomic` cover doesn't
# currently support being run against multiple packages

REPORT="${1}"
if [ -z "${REPORT}" ]; then
  echo "Specify a report filename, e.g. '${0}' myreport.txt" >&2
  exit 64
fi
cd "$(dirname "${0}")"
TEMP_SINGLE_REPORT="$(mktemp -t coverage.tmp.XXXXXXXXXX)"
echo "mode: atomic" > "${REPORT}"
HEAD_REV="$(git rev-parse HEAD)"
# Dump package list to file rather than pipe, to avoid exit inside loop not
# causing outer shell to exit due to running in a subshell.
PACKAGE_LIST="$(mktemp -t package-list.tmp.XXXXXXXXXX)"
go list ./... > "${PACKAGE_LIST}"

while read package
do
  CGO_ENABLED=1 go test -ldflags "-X github.com/taskcluster/generic-worker.revision=${HEAD_REV}" -v -race -timeout 1h -covermode=atomic "-coverprofile=${TEMP_SINGLE_REPORT}" "${package}"
  if [ -f "${TEMP_SINGLE_REPORT}" ]; then
    sed 1d "${TEMP_SINGLE_REPORT}" >> "${REPORT}"
    rm "${TEMP_SINGLE_REPORT}"
  fi
done < "${PACKAGE_LIST}"

rm "${PACKAGE_LIST}"
