#!/bin/bash -e

cd "$(dirname "${0}")"
go get github.com/taskcluster/generic-worker/yamltojson

windows_payload_file="$(mktemp -t windows-payload.json.XXXXXX)"
all_unix_style_payload_file="$(mktemp -t all-unix-style-payload.json.XXXXXX)"
cat windows.yml | "$(go env GOPATH)/bin/yamltojson" > "${windows_payload_file}"
cat all-unix-style.yml | "$(go env GOPATH)/bin/yamltojson" > "${all_unix_style_payload_file}"
aws s3 cp "${windows_payload_file}" s3://schemas.taskcluster.net/generic-worker/v1/windows.json
aws s3 cp "${windows_payload_file}" s3://schemas.taskcluster.net/generic-worker/v1/payload.json
aws s3 cp "${all_unix_style_payload_file}" s3://schemas.taskcluster.net/generic-worker/v1/linux.json
aws s3 cp "${all_unix_style_payload_file}" s3://schemas.taskcluster.net/generic-worker/v1/macos.json
rm "${windows_payload_file}"
rm "${all_unix_style_payload_file}"
curl https://schemas.taskcluster.net/generic-worker/v1/payload.json
curl https://schemas.taskcluster.net/generic-worker/v1/windows.json
curl https://schemas.taskcluster.net/generic-worker/v1/linux.json
curl https://schemas.taskcluster.net/generic-worker/v1/macos.json
echo
echo "Schema updated - check out https://docs.taskcluster.net/reference/workers/generic-worker/payload"
