#!/bin/bash -e

cd "$(dirname "${0}")"
go get github.com/taskcluster/generic-worker/yamltojson

for build in docker_linux native_linux native_windows native_darwin; do
  payload_file="$(mktemp -t payload.json.XXXXXX)"
  cat "${build}.yml" | "$(go env GOPATH)/bin/yamltojson" > "${payload_file}"
  aws s3 cp "${payload_file}" "s3://schemas.taskcluster.net/generic-worker/v1/${build}.json"
  rm "${payload_file}"
  curl "https://schemas.taskcluster.net/generic-worker/v1/${build}.json"
done

echo
echo "Schema updated - check out https://docs.taskcluster.net/reference/workers/generic-worker/payload"
