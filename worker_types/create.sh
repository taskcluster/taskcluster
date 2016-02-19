#!/bin/bash -e

# TODO: [pmoore] submit a task after updating worker type
# TODO: [pmoore] remove hard coded references to us-west-2
# TODO: [pmoore] remove references to pmoore, pmoore's aws key, and anything pmoore-ish

echo "$(date): Checking inputs..."

if [ "${#}" -ne 1 ]; then
  echo "Please provide a worker type, e.g. ./create.sh win2012r2" >&2
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

# generate a random slugid for aws client token...
go get github.com/taskcluster/slugid-go/slug
go install github.com/taskcluster/generic-worker/update-worker-type
SLUGID=$("${GOPATH}/bin/slug")

# aws cli docs lie, they say userdata must be base64 encoded, but cli encodes for you, so just cat it...
USER_DATA="$(cat userdata)"

# find out latest windows 2012 r2 ami to use...
AMI="$(aws ec2 describe-images --owners self amazon --filters "Name=platform,Values=windows" "Name=name,Values=Windows_Server-2012-R2_RTM-English-64Bit-Base*" --query 'Images[*].{A:CreationDate,B:ImageId}' --output text | sort -u | tail -1 | cut -f2)"
echo "$(date): Latest Windows 2012 R2 AMI in Oregon is: ${AMI}"

# query old instances
echo "$(date): Querying old instances of ${WORKER_TYPE}..."
OLD_INSTANCES="$(aws ec2 describe-instances --filters Name=tag-key,Values=WorkerType "Name=tag-value,Values=${WORKER_TYPE}" --query 'Reservations[*].Instances[*].InstanceId' --output text)"

# now terminate them
echo "$(date): Now terminating instances" ${OLD_INSTANCES}...
aws ec2 terminate-instances --instance-ids ${OLD_INSTANCES} >/dev/null 2>&1

# find old ami
echo "$(date): Querying previous AMI..."
OLD_SNAPSHOT="$(aws ec2 describe-images --owners self amazon --filters "Name=name,Values=${WORKER_TYPE} mozillabuild pmoore version*" --query 'Images[*].BlockDeviceMappings[*].Ebs.SnapshotId' --output text)"

# find old snapshot
echo "$(date): Querying snapshot used in this previous AMI..."
OLD_AMI="$(aws ec2 describe-images --owners self amazon --filters "Name=name,Values=${WORKER_TYPE} mozillabuild pmoore version*" --query 'Images[*].ImageId' --output text)"

# deregister old AMI
if [ -n "${OLD_AMI}" ]; then
  echo "$(date): Deregistering the old AMI (${OLD_AMI})..."
  aws ec2 deregister-image --image-id "${OLD_AMI}"
else
  echo "$(date): No old AMI to deregister."
fi

# delete old snapshot
if [ -n "${OLD_SNAPSHOT}" ]; then
  echo "$(date): Deleting the old snapshot (${OLD_SNAPSHOT})..."
  aws ec2 delete-snapshot --snapshot-id "${OLD_SNAPSHOT}"
else
  echo "$(date): No old snapshot to delete."
fi

# create new base ami, and apply user-data
# filter output, to get INSTANCE_ID
INSTANCE_ID="$(aws --region us-west-2 ec2 run-instances --image-id "${AMI}" --key-name pmoore-oregan-us-west-2 --security-groups "rdp-only" "ssh-only" --user-data "$(cat userdata)" --instance-type c4.2xlarge --block-device-mappings DeviceName=/dev/sda1,Ebs='{VolumeSize=75,DeleteOnTermination=true,VolumeType=gp2}' --instance-initiated-shutdown-behavior terminate --client-token "${SLUGID}" | sed -n 's/^ *"InstanceId": "\(.*\)", */\1/p')"

echo "$(date): I've triggered the creation of instance ${INSTANCE_ID} - but now we will need to wait an hour("'!'") for it to be created and bootstrapped..."
aws ec2 create-tags --resources "${INSTANCE_ID}" --tags "Key=WorkerType,Value=${WORKER_TYPE}"
echo "$(date): I've tagged it with \"WorkerType\": \"${WORKER_TYPE}\""

# sleep an hour, the installs take forever...
sleep 3600

echo "$(date): Now snapshotting the instance to create an AMI..."
# now capture the AMI
IMAGE_ID="$(aws --region us-west-2 ec2 create-image --instance-id "${INSTANCE_ID}" --name "${WORKER_TYPE} mozillabuild pmoore version ${SLUGID}" --description "firefox desktop builds on windows - taskcluster worker - version ${SLUGID}" | sed -n 's/^ *"ImageId": *"\(.*\)" *$/\1/p')"

echo "$(date): The AMI is currently being created: ${IMAGE_ID}"

PASSWORD="$(aws ec2 get-password-data --instance-id "${INSTANCE_ID}" --priv-launch-key ~/.ssh/pmoore-oregan-us-west-2.pem --output text --query PasswordData)"
PUBLIC_IP="$(aws ec2 describe-instances --instance-id "${INSTANCE_ID}" --query 'Reservations[*].Instances[*].NetworkInterfaces[*].Association.PublicIp' --output text)"

echo "$(date): To connect to the template instance (please don't do so until AMI creation process is completed"'!'"):"
echo
echo "             Public IP: ${PUBLIC_IP}"
echo "             Username:  Administrator"
echo "             Password:  ${PASSWORD}"
echo
echo "$(date): To monitor the AMI creation process, see:"
echo
echo "             https://us-west-2.console.aws.amazon.com/ec2/v2/home?region=us-west-2#Images:visibility=owned-by-me;search=${IMAGE_ID};sort=desc:platform"

"${GOPATH}/bin/update-worker-type" "${IMAGE_ID}" "${WORKER_TYPE}"

echo
echo "$(date): The worker type has been proactively updated("'!'"):"
echo
echo "             https://tools.taskcluster.net/aws-provisioner/#${WORKER_TYPE}/edit"

{
    echo "Instance:  ${INSTANCE_ID}"
    echo "Public IP: ${PUBLIC_IP}"
    echo "Password:  ${PASSWORD}"
    echo "AMI:       ${IMAGE_ID}"
} > latest.txt
