#!/bin/bash -e

deploy_json=deploy/deploy.json;

NODE_VERSION_MAJOR=$(node --version | tr -d v | awk -F. '{print $1}')
NODE_VERSION_MINOR=$(node --version | tr -d v | awk -F. '{print $2}')

if [ 0$NODE_VERSION_MAJOR -lt 8 -o 0$NODE_VERSION_MINOR -lt 5 ]; then
  echo "$0 requires node version 8.5.0 or higher." >&2
  exit 1
fi

if ! [ -f $deploy_json ]; then
  echo "$deploy_json not found. Please run deploy/bin/import-docker-worker-secrets." >&2
  exit 1
fi

deploy/bin/build app
deploy/bin/update-worker-types.js
