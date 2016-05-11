#!/bin/bash -e

############ This script should be used for creating or updating a worker type
############ (i.e. creating AMIs in AWS EC2, and calling the TaskCluster AWS
############ Provisioner API to update the worker type definition with the
############ newly generated AMIs).

# TODO: [pmoore] submit a task after updating worker type
# TODO: [pmoore] publish ssh key to secret store after generating it

function log {
  TEXT="${1}"
  echo -e "\x1B[38;5;${COLOUR}m$(date): ${WORKER_TYPE}: ${REGION}: ${TEXT}\x1B[0m"
}

REGION="${1}"
COLOUR="${2}"

if [ -z "${REGION}" ]; then
  echo "Must specify a region to process_region.sh script" >&2
  exit 64
fi

if [ -z "${WORKER_TYPE}" ]; then
  echo "Must export valid WORKER_TYPE env var before calling this script" >&2
  exit 65
fi

if [ -z "${COLOUR}" ]; then
  echo "Missing colour code as input for process_region.sh script" >&2
  exit 66
fi

cd "$(dirname "${0}")/${WORKER_TYPE}"

log "Generating new ssh key..."
rm -rf "${REGION}.id_rsa"
aws --region "${REGION}" ec2 delete-key-pair --key-name "${WORKER_TYPE}_${REGION}" || true
aws --region "${REGION}" ec2 create-key-pair --key-name "${WORKER_TYPE}_${REGION}" --query 'KeyMaterial' --output text > "${REGION}.id_rsa"
chmod 400 "${REGION}.id_rsa"

# aws cli docs lie, they say userdata must be base64 encoded, but cli encodes for you, so just cat it...
USER_DATA="$(cat userdata)"

# find out latest windows 2012 r2 ami to use...
AMI="$(aws --region "${REGION}" ec2 describe-images --owners self amazon --filters "Name=platform,Values=windows" "Name=name,Values=Windows_Server-2012-R2_RTM-English-64Bit-Base*" --query 'Images[*].{A:CreationDate,B:ImageId}' --output text | sort -u | tail -1 | cut -f2)"
log "Latest Windows 2012 R2 AMI is: ${AMI}"

# query old instances
log "Querying old instances..."
OLD_INSTANCES="$(aws --region "${REGION}" ec2 describe-instances --filters "Name=tag:WorkerType,Values=aws-provisioner-v1/${WORKER_TYPE}" --query 'Reservations[*].Instances[*].InstanceId' --output text)"

# now terminate them
if [ -n "${OLD_INSTANCES}" ]; then
  log "Now terminating instances" ${OLD_INSTANCES}...
  aws --region "${REGION}" ec2 terminate-instances --instance-ids ${OLD_INSTANCES} >/dev/null 2>&1
else
  log "No previous instances to terminate."
fi

# find old ami
log "Querying previous AMI..."
OLD_SNAPSHOT="$(aws --region "${REGION}" ec2 describe-images --owners self amazon --filters "Name=name,Values=${WORKER_TYPE} mozillabuild version*" --query 'Images[*].BlockDeviceMappings[*].Ebs.SnapshotId' --output text)"

# find old snapshot
log "Querying snapshot used in this previous AMI..."
OLD_AMI="$(aws --region "${REGION}" ec2 describe-images --owners self amazon --filters "Name=name,Values=${WORKER_TYPE} mozillabuild version*" --query 'Images[*].ImageId' --output text)"

# deregister old AMI
if [ -n "${OLD_AMI}" ]; then
  log "Deregistering the old AMI (${OLD_AMI})..."
  # note this can fail if it is already in process of being deregistered, so allow to fail...
  aws --region "${REGION}" ec2 deregister-image --image-id "${OLD_AMI}" 2>/dev/null || true
else
  log "No old AMI to deregister."
fi

# delete old snapshot
if [ -n "${OLD_SNAPSHOT}" ]; then
  log "Deleting the old snapshot (${OLD_SNAPSHOT})..."
  aws --region "${REGION}" ec2 delete-snapshot --snapshot-id "${OLD_SNAPSHOT}"
else
  log "No old snapshot to delete."
fi

# make sure we have an ssh security group in this region
# note if we *try* to create a security group that already exists (regardless of whether it is successful or not), there will be a cloudwatch alarm, so avoid this
# by checking first.
echo 'ssh-only 22 SSH only
rdp-only 3389 RDP only
livelog-direct 60023 For connecting to livelog GET interface running directly on host' | while read group_name port description; do
  if ! aws --region "${REGION}" ec2 describe-security-groups --group-names "${group_name}" >/dev/null 2>&1; then
    SECURITY_GROUP="$(aws --region "${REGION}" ec2 create-security-group --group-name "${group_name}" --description "${description}" --output text 2>/dev/null || true)"
    aws --region "${REGION}" ec2 authorize-security-group-ingress --group-id "${SECURITY_GROUP}" --ip-permissions '[{"IpProtocol": "tcp", "FromPort": '"${port}"', "ToPort": '"${port}"', "IpRanges": [{"CidrIp": "0.0.0.0/0"}]}]'
  fi
done

# create new base ami, and apply user-data
# filter output, to get INSTANCE_ID
INSTANCE_ID="$(aws --region "${REGION}" ec2 run-instances --image-id "${AMI}" --key-name "${WORKER_TYPE}_${REGION}" --security-groups "rdp-only" "ssh-only" --user-data "$(cat userdata)" --instance-type c4.2xlarge --block-device-mappings DeviceName=/dev/sda1,Ebs='{VolumeSize=75,DeleteOnTermination=true,VolumeType=gp2}' --instance-initiated-shutdown-behavior stop --client-token "${SLUGID}" | sed -n 's/^ *"InstanceId": "\(.*\)", */\1/p')"

log "I've triggered the creation of instance ${INSTANCE_ID} - it can take a \x1B[4mVery Long Time™\x1B[24m for it to be created and bootstrapped..."
aws --region "${REGION}" ec2 create-tags --resources "${INSTANCE_ID}" --tags "Key=WorkerType,Value=${WORKER_TYPE}"
log "I've tagged it with \"WorkerType\": \"${WORKER_TYPE}\""

# grab public IP before it shuts down and loses it!
PUBLIC_IP="$(aws --region "${REGION}" ec2 describe-instances --instance-id "${INSTANCE_ID}" --query 'Reservations[*].Instances[*].NetworkInterfaces[*].Association.PublicIp' --output text)"

# poll for a stopped state
until aws --region "${REGION}" ec2 wait instance-stopped --instance-ids "${INSTANCE_ID}" >/dev/null 2>&1; do
  log "  Waiting for instance ${INSTANCE_ID} to shut down..."
  sleep 30
done

log "Now snapshotting the instance to create an AMI..."
# now capture the AMI
IMAGE_ID="$(aws --region "${REGION}" ec2 create-image --instance-id "${INSTANCE_ID}" --name "${WORKER_TYPE} mozillabuild version ${SLUGID}" --description "firefox desktop builds on windows - taskcluster worker - version ${SLUGID}" | sed -n 's/^ *"ImageId": *"\(.*\)" *$/\1/p')"

log "The AMI is currently being created: ${IMAGE_ID}"

PASSWORD="$(aws --region "${REGION}" ec2 get-password-data --instance-id "${INSTANCE_ID}" --priv-launch-key ${REGION}.id_rsa --output text --query PasswordData)"

log "To connect to the template instance (please don't do so until AMI creation process is completed"'!'"):"
log ''
log "             Public IP: ${PUBLIC_IP}"
log "             Username:  Administrator"
log "             Password:  ${PASSWORD}"
log ''
log "To monitor the AMI creation process, see:"
log ''
log "             https://${REGION}.console.aws.amazon.com/ec2/v2/home?region=${REGION}#Images:visibility=owned-by-me;search=${IMAGE_ID};sort=desc:platform"

log "I've triggered the snapshot of instance ${INSTANCE_ID} as ${IMAGE_ID} - but now we will need to wait a \x1B[4mVery Long Time™\x1B[24m for it to be created..."

until aws --region "${REGION}" ec2 wait image-available --image-ids "${IMAGE_ID}" >/dev/null 2>&1; do
  log "  Waiting for ${IMAGE_ID} availability..."
  sleep 30
done

touch "${REGION}.${IMAGE_ID}.latest-ami"

log ''
log "The worker type has been proactively updated("'!'"):"
log ''
log "             https://tools.taskcluster.net/aws-provisioner/#${WORKER_TYPE}/edit"

{
    echo "Instance:  ${INSTANCE_ID}"
    echo "Public IP: ${PUBLIC_IP}"
    echo "Password:  ${PASSWORD}"
    echo "AMI:       ${IMAGE_ID}"
} > "${REGION}.secrets"

log ''
log "Starting instance ${INSTANCE_ID} back up..."
if aws --region "${REGION}" ec2 start-instances --instance-ids "${INSTANCE_ID}" >/dev/null 2>&1; then
  log "Done"
else
  log "Could not start up instance ${INSTANCE_ID}"
fi
