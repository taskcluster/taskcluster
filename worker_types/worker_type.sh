#!/bin/bash -e

############ This script should be used for creating or updating a worker type
############ (i.e. creating AMIs in AWS EC2, and calling the Taskcluster AWS
############ Provisioner API to update the worker type definition with the
############ newly generated AMIs).

# TODO: [pmoore] submit a task after updating worker type
# TODO: [pmoore] publish ssh key to secret store after generating it

echo "$(date): Checking inputs..."

if [ "${#}" -ne 2 ]; then
  echo "Please provide a worker type and action (delete|update), e.g. worker_type.sh win2012r2 update" >&2
  exit 64
fi

export WORKER_TYPE="${1}"
export ACTION="${2}"

if [ ! -d "$(dirname "${0}")/${WORKER_TYPE}" ]; then
  echo "ERROR: No directory for worker type: '$(dirname "${0}")/${WORKER_TYPE}'"
  exit 65
fi

echo "$(date): Starting"'!'

# cd into directory containing script...
cd "$(dirname "${0}")/${WORKER_TYPE}"

# needed to not confuse the script later
rm -f *.latest-ami

# generate a random slugid for aws client token...
go get github.com/taskcluster/slugid-go/slug
go install github.com/taskcluster/generic-worker/update-worker-type
export SLUGID=$("${GOPATH}/bin/slug")

# aws ec2 describe-regions --query '{A:Regions[*].RegionName}' --output text | grep -v sa-east-1 | while read x REGION; do
# (skip sa-east-1 since it doesn't support all the APIs we use in this script)

echo us-west-1 118 us-west-2 199 us-east-1 100 | xargs -P32 -n2 ../process_region.sh

if [ "${ACTION}" == "update" ]; then
  "${GOPATH}/bin/update-worker-type" .
  echo
  echo "The worker type has been proactively updated("'!'"):"
  echo
  echo "             https://tools.taskcluster.net/aws-provisioner/#${WORKER_TYPE}/edit"
fi
