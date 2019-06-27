#!/bin/bash
set -u

# quick way to track this somwhere for now
# likely port to python later
# maybe have it write directly to sops?

SERVER_ADDRESS=$1
SERVER_USERNAME=$2
SERVER_PASSWORD=$3
PREFIX=$4

NAMES="
taskcluster-auth
taskcluster-github
taskcluster-hooks
taskcluster-index
taskcluster-notify
taskcluster-queue
taskcluster-secrets
taskcluster-web-server
taskcluster-worker-manager
"

for NAME in $NAMES; do
    FULLNAME="${PREFIX}-${NAME}"
    curl -sfu "${SERVER_USERNAME}:${SERVER_PASSWORD}" "https://${SERVER_ADDRESS}/api/users/$FULLNAME" > /dev/null
    if [[ $? -eq 0 ]] ; then
        echo "skipping $FULLNAME because they already exist"
    else
        echo "creating rabbitmq user $FULLNAME"
        PASSWORD=$(openssl rand -base64 24)
        PAYLOAD="{\"password\":\"${PASSWORD}\",\"tags\":\"\"}"
        curl -X PUT -H "Content-Type: application/json" -d "$PAYLOAD" \
        -sfu "${SERVER_USERNAME}:${SERVER_PASSWORD}" "https://${SERVER_ADDRESS}/api/users/$FULLNAME" > /dev/null
        if [[ $? -ne 0 ]] ; then
            echo "Error creating rabbitmq user $FULLNAME. Aborting."
            exit 1
        fi
        echo "$PASSWORD" >> "rabbitmq-${FULLNAME}"
    fi

done
