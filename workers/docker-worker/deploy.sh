#!/bin/bash -e

deploy_json=deploy/deploy.json;

NODE_VERSION_MAJOR=$(node --version | tr -d v | awk -F. '{print $1}')
NODE_VERSION_MINOR=$(node --version | tr -d v | awk -F. '{print $2}')

if [ "$TASKCLUSTER_CLIENT_ID" == "" -o "$TASKCLUSTER_ACCESS_TOKEN" == "" ]; then
    echo "You don't seem to have proper Taskcluster credentials, please run 'taskcluster-cli signin' command" >&2
    exit 1
fi

if [ 0$NODE_VERSION_MAJOR -lt 8 -o 0$NODE_VERSION_MAJOR -eq 8 -a 0$NODE_VERSION_MINOR -lt 15 ]; then
  echo "$0 requires node version 8.5.0 or higher." >&2
  exit 1
fi

if [ -z "$PASSWORD_STORE_DIR" ]; then
    export PASSWORD_STORE_DIR=$HOME/.password-store
fi

if ! [ -d $PASSWORD_STORE_DIR ]; then
    echo "Password store not found, please install it by running:"
    echo "git clone ssh://gitolite3@git-internal.mozilla.org/taskcluster/secrets.git $PASSWORD_STORE_DIR"
    echo "To clone this repository, you need Mozilla VPN access. Please check \
https://mana.mozilla.org/wiki/display/IT/Mozilla+VPN for information on how to setup VPN connection."
    exit 1
fi

deploy/bin/import-docker-worker-secrets
deploy/bin/build app
deploy/bin/update-worker-types.js $*
rm -f /tmp/docker-worker*
