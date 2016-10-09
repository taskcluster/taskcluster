#!/bin/bash -e

cd "$(dirname "${0}")"
go get github.com/taskcluster/generic-worker/yamltojson
jsonFile="$(mktemp -t jsonFile.XXXXXX)"
cat windows.yml | yamltojson > "${jsonFile}"
aws s3 cp "${jsonFile}" s3://schemas.taskcluster.net/generic-worker/v1/payload.json
rm "${jsonFile}"
curl http://schemas.taskcluster.net/generic-worker/v1/payload.json
echo
echo "Schema updated - check out https://docs.taskcluster.net/manual/execution/workers/generic-worker"
