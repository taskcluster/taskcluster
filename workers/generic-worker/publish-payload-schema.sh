#!/bin/bash -e

function pub {
  dest="${1}"
  src="${2}"
  payload_file="$(mktemp -t payload.json.XXXXXX)"
  cat "${src}" | "$(go env GOPATH)/bin/yamltojson" > "${payload_file}"
  aws s3 cp "${payload_file}" "s3://schemas.taskcluster.net/generic-worker/v1/${dest}"
  rm "${payload_file}"
  curl "https://schemas.taskcluster.net/generic-worker/v1/${dest}"
}

cd "$(dirname "${0}")"
go get github.com/taskcluster/generic-worker/yamltojson

pub docker_posix.json       docker_posix.yml
pub multiuser_posix.json    multiuser_posix.yml
pub multiuser_windows.json  multiuser_windows.yml
pub simple_posix.json       simple_posix.yml

echo
echo "Schema updated - check out https://docs.taskcluster.net/reference/workers/generic-worker/payload"
