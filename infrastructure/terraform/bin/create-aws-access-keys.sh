#!/bin/bash
set -u

# quick way to track this somwhere for now
# likely port to python and boto later
# maybe have it write directly to sops?

PREFIX=$1

NAMES="
taskcluster-auth
taskcluster-notify
taskcluster-queue
"

for NAME in $NAMES; do
    FULLNAME="${PREFIX}-${NAME}"
    aws iam list-access-keys --user "$FULLNAME" | grep Active > /dev/null
    if [[ $? -eq 0 ]] ; then
        echo "skipping $FULLNAME because they already have an active key"
    else
        echo "creating key in $FULLNAME.json"
        aws iam create-access-key --user-name "$FULLNAME" >> "$FULLNAME.json"
    fi
done

