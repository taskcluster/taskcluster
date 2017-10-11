#!/bin/bash -e

deploy_json=deploy/deploy.json;

NODE_VERSION_MAJOR=$(node --version | tr -d v | awk -F. '{print $1}')
NODE_VERSION_MINOR=$(node --version | tr -d v | awk -F. '{print $2}')

if [ 0$NODE_VERSION_MAJOR -lt 8 -o 0$NODE_VERSION_MINOR -lt 5 ]; then
  echo "$0 requires node version 8.5.0 or higher." >&2
  exit 1
fi

if ! [ -d $HOME/.password-store ]; then
    echo "Password store not found, please install it by running:"
    echo "git clone ssh://gitolite3@git-internal.mozilla.org/taskcluster/secrets.git $HOME/.password-store"
    echo "To clone this repository, you need Mozilla VPN access. Please check \
https://mana.mozilla.org/wiki/display/IT/Mozilla+VPN for information on how to setup VPN connection."
    exit 1
fi

deploy/bin/import-docker-worker-secrets
deploy/bin/build app
deploy/bin/update-worker-types.js $*
rm -f /tmp/docker-worker*
