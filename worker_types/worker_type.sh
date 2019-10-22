#!/bin/bash -e

############ This script should be used for creating or updating a worker type
############ (i.e. creating AMIs in AWS EC2, and calling the Taskcluster AWS
############ Provisioner API to update the worker type definition with the
############ newly generated AMIs).

# TODO: [pmoore] submit a task after updating worker type
# TODO: [pmoore] publish ssh key to secret store after generating it

echo "$(date): Checking inputs..."

if [ "${#}" -ne 3 ]; then
  echo "Please specify a provider (aws/gcp), worker pool (e.g. pmoore-test/gwci-linux) and action (delete|update), e.g. worker_type.sh aws aws-provisioner-v1/win2012r2 update" >&2
  exit 64
fi

export PROVIDER="${1}"
if [ "${PROVIDER}" != "aws" ] && [ "${PROVIDER}" != "gcp" ]; then
  echo "worker_type.sh: provider must be 'aws' or 'gcp' but '${PROVIDER}' was specified" >&2
  exit 67
fi

export WORKER_POOL="${2}"
if ! echo "${WORKER_POOL}" | grep -q '/'; then
  echo "worker_type.sh: Worker pool (second argument) must contain '/' character - but have '${WORKER_POOL}'" >&2
  exit 68
fi

export PROVISIONER_ID="${WORKER_POOL%%/*}"
if [ -z "${PROVISIONER_ID}" ]; then
  echo "Empty provisioner ID" >&2
  exit 69
fi

export WORKER_TYPE="${WORKER_POOL#*/}"
if [ ! -d "$(dirname "${0}")/${WORKER_TYPE}" ]; then
  echo "worker_type.sh: No directory for worker type: '$(dirname "${0}")/${WORKER_TYPE}'" >&2
  exit 65
fi

export ACTION="${3}"
if [ "${ACTION}" != "update" ] && [ "${ACTION}" != "delete" ]; then
  echo "worker_type.sh: action must be 'delete' or 'update' but '${ACTION}' was specified" >&2
  exit 66
fi

echo "$(date): Starting"'!'

# cd into directory containing script...
cd "$(dirname "${0}")/${WORKER_TYPE}"

# generate a random slugid for aws client token...
go get github.com/taskcluster/slugid-go/slugid
go install github.com/taskcluster/generic-worker/update-worker-type
export SLUGID=$("${GOPATH}/bin/slug")

# aws ec2 describe-regions --query '{A:Regions[*].RegionName}' --output text | grep -v sa-east-1 | while read x REGION; do
# (skip sa-east-1 since it doesn't support all the APIs we use in this script)

# needed to not confuse the script later
rm -f *.latest-image

case "${PROVIDER}" in
  aws) 
    echo us-west-1 118 us-west-2 199 us-east-1 100 | xargs -P32 -n2 ../process_region.sh

    if [ "${ACTION}" == "update" ]; then
      "${GOPATH}/bin/update-worker-type" .
      echo
      echo 'The worker type has been proactively updated(!)'
      echo
      echo "             https://tools.taskcluster.net/aws-provisioner/#${WORKER_TYPE}/edit"
    fi
    ;;
  gcp)

    # UUID is 20 random chars of [a-z0-9]
    UUID="$(LC_CTYPE=C </dev/urandom tr -dc "a-z0-9" | head -c 20)"
    export UNIQUE_NAME="${WORKER_TYPE}-${UUID}"

    echo us-central1-a 118 | xargs -P32 -n3 ../process_region.sh

    if [ "${ACTION}" == "update" ]; then
      "${GOPATH}/bin/update-worker-pool" .
      echo
      echo 'The worker type has been proactively updated(!)'
      echo
      echo "             https://taskcluster-ui.herokuapp.com/worker-manager/${PROVISIONER_ID}%2F${WORKER_TYPE}"
    fi
    ;;
esac
