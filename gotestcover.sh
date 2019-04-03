#!/bin/bash -e

ENGINE="${1}"
REPORT="${2}"
if [ -z "${REPORT}" ]; then
  echo "Specify build tags and a report filename, e.g. '${0}' 'nativeEngine' myreport.txt" >&2
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
  CGO_ENABLED=1 go test -tags "${ENGINE}" -ldflags "-X github.com/taskcluster/generic-worker.revision=${HEAD_REV}" -race -timeout 1h -covermode=atomic "-coverprofile=${TEMP_SINGLE_REPORT}" "${package}"
  if [ -f "${TEMP_SINGLE_REPORT}" ]; then
    sed 1d "${TEMP_SINGLE_REPORT}" >> "${REPORT}"
    rm "${TEMP_SINGLE_REPORT}"
  fi
done < "${PACKAGE_LIST}"

rm "${PACKAGE_LIST}"
