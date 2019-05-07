#!/bin/bash
set -eu

# quick way to track this somwhere for now
# likely port to python and boto later

PREFIX=$1

NAMES="
taskcluster-auth
"

for NAME in $NAMES; do
    FULLNAME="${PREFIX}-${NAME}"
    aws iam list-access-keys --user "$FULLNAME" | grep Active > /dev/null
    if [[ ! $? ]] ; then
        echo "creating key in $FULLNAME.json"
        echo aws iam create-access-key --user-name "$FULLNAME" >> "$FULLNAME.json"
    else
        echo "skipping $FULLNAME because they already have an active key"
    fi
done

