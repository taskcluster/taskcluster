#!/bin/bash -e

function process_region {
  REGION="${1}"

  # query old instances
  echo "$(date): Querying old instances of ${WORKER_TYPE}..."
  OLD_INSTANCES="$(aws --region ${REGION} ec2 describe-instances --filters Name=tag-key,Values=WorkerType "Name=tag-value,Values=${WORKER_TYPE}" --query 'Reservations[*].Instances[*].InstanceId' --output text)"

  # now terminate them
  if [ -n "${OLD_INSTANCES}" ]; then
    echo "$(date): Now terminating instances" ${OLD_INSTANCES}...
    aws --region ${REGION} ec2 terminate-instances --instance-ids ${OLD_INSTANCES} >/dev/null 2>&1
  else
    echo "$(date): No previous instances to terminate."
  fi

  # find old ami
  echo "$(date): Querying previous AMI..."
  OLD_SNAPSHOT="$(aws --region ${REGION} ec2 describe-images --owners self amazon --filters "Name=name,Values=${WORKER_TYPE} mozillabuild version*" --query 'Images[*].BlockDeviceMappings[*].Ebs.SnapshotId' --output text)"

  # find old snapshot
  echo "$(date): Querying snapshot used in this previous AMI..."
  OLD_AMI="$(aws --region ${REGION} ec2 describe-images --owners self amazon --filters "Name=name,Values=${WORKER_TYPE} mozillabuild version*" --query 'Images[*].ImageId' --output text)"

  # deregister old AMI
  if [ -n "${OLD_AMI}" ]; then
    echo "$(date): Deregistering the old AMI (${OLD_AMI})..."
    aws --region ${REGION} ec2 deregister-image --image-id "${OLD_AMI}"
  else
    echo "$(date): No old AMI to deregister."
  fi

  # delete old snapshot
  if [ -n "${OLD_SNAPSHOT}" ]; then
    echo "$(date): Deleting the old snapshot (${OLD_SNAPSHOT})..."
    aws --region ${REGION} ec2 delete-snapshot --snapshot-id "${OLD_SNAPSHOT}"
  else
    echo "$(date): No old snapshot to delete."
  fi

  echo "$(date): Done"'!'
}

echo "$(date): Checking inputs..."

if [ "${#}" -ne 1 ]; then
  echo "Please provide a worker type, e.g. ./destroy.sh win2012r2" >&2
  exit 64
fi

WORKER_TYPE="${1}"

if [ ! -d "$(dirname "${0}")/${WORKER_TYPE}" ]; then
  echo "ERROR: No directory for worker type: '$(dirname "${0}")/${WORKER_TYPE}'"
  exit 65
fi

echo "$(date): Starting"'!'

# cd into directory containing script...
cd "$(dirname "${0}")/${WORKER_TYPE}"

aws ec2 describe-regions --query '{A:Regions[*].RegionName}' --output text | grep -v sa-east-1 | while read x REGION; do
# (skip sa-east-1 since it doesn't support all the APIs we use in this script)
# for REGION in us-west-{1,2} us-east-1; do
  process_region "${REGION}" > "${REGION}-destroy.log" 2>&1 &
done

echo "$(date): Worker types are being destroyed in the background: watch the *-destroy.log log files in '$(pwd)'."
