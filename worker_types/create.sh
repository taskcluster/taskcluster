#!/bin/bash -e

# TODO: [pmoore] submit a task after updating worker type
# TODO: [pmoore] publish ssh key to secret store after generating it

function process_region {
  REGION="${1}"

  echo "$(date): Generating new ssh key..."
  rm -rf "${REGION}.id_rsa"
  aws --region ${REGION} ec2 delete-key-pair --key-name "${WORKER_TYPE}_${REGION}" || true
  aws --region ${REGION} ec2 create-key-pair --key-name "${WORKER_TYPE}_${REGION}" --query 'KeyMaterial' --output text > "${REGION}.id_rsa"
  chmod 400 "${REGION}.id_rsa"

  # aws cli docs lie, they say userdata must be base64 encoded, but cli encodes for you, so just cat it...
  USER_DATA="$(cat userdata)"

  # find out latest windows 2012 r2 ami to use...
  AMI="$(aws --region ${REGION} ec2 describe-images --owners self amazon --filters "Name=platform,Values=windows" "Name=name,Values=Windows_Server-2012-R2_RTM-English-64Bit-Base*" --query 'Images[*].{A:CreationDate,B:ImageId}' --output text | sort -u | tail -1 | cut -f2)"
  echo "$(date): Latest Windows 2012 R2 AMI in ${REGION} is: ${AMI}"

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

  # make sure we have an ssh security group in this region
  SECURITY_GROUP="$(aws --region ${REGION} ec2 create-security-group --group-name ssh-only --description "SSH only" --output text 2>/dev/null || true)"
  [ -n "${SECURITY_GROUP}" ] && aws --region ${REGION} ec2 authorize-security-group-ingress --group-id "${SECURITY_GROUP}" --ip-permissions '[{"IpProtocol": "tcp", "FromPort": 22, "ToPort": 22, "IpRanges": [{"CidrIp": "0.0.0.0/0"}]}]'

  # make sure we have an rdp security group in this region
  SECURITY_GROUP="$(aws --region ${REGION} ec2 create-security-group --group-name rdp-only --description "RDP only" --output text 2>/dev/null || true)"
  [ -n "${SECURITY_GROUP}" ] && aws --region ${REGION} ec2 authorize-security-group-ingress --group-id "${SECURITY_GROUP}" --ip-permissions '[{"IpProtocol": "tcp", "FromPort": 3389, "ToPort": 3389, "IpRanges": [{"CidrIp": "0.0.0.0/0"}]}]'

  # create new base ami, and apply user-data
  # filter output, to get INSTANCE_ID
  INSTANCE_ID="$(aws --region ${REGION} ec2 run-instances --image-id "${AMI}" --key-name "${WORKER_TYPE}_${REGION}" --security-groups "rdp-only" "ssh-only" --user-data "$(cat userdata)" --instance-type c4.2xlarge --block-device-mappings DeviceName=/dev/sda1,Ebs='{VolumeSize=75,DeleteOnTermination=true,VolumeType=gp2}' --instance-initiated-shutdown-behavior stop --client-token "${SLUGID}" | sed -n 's/^ *"InstanceId": "\(.*\)", */\1/p')"

  echo "$(date): I've triggered the creation of instance ${INSTANCE_ID} - but now we will need to wait ~90 mins("'!'") for it to be created and bootstrapped..."
  aws --region ${REGION} ec2 create-tags --resources "${INSTANCE_ID}" --tags "Key=WorkerType,Value=${WORKER_TYPE}"
  echo "$(date): I've tagged it with \"WorkerType\": \"${WORKER_TYPE}\""

  # grab public IP before it shuts down and loses it!
  PUBLIC_IP="$(aws --region ${REGION} ec2 describe-instances --instance-id "${INSTANCE_ID}" --query 'Reservations[*].Instances[*].NetworkInterfaces[*].Association.PublicIp' --output text)"

  # poll for a stopped state
  until aws --region ${REGION} ec2 wait instance-stopped --instance-ids "${INSTANCE_ID}" >/dev/null 2>&1; do
    echo "$(date):   Waiting for instance ${INSTANCE_ID} to shut down..."
    sleep 30
  done

  echo "$(date): Now snapshotting the instance to create an AMI..."
  # now capture the AMI
  IMAGE_ID="$(aws --region ${REGION} ec2 create-image --instance-id "${INSTANCE_ID}" --name "${WORKER_TYPE} mozillabuild version ${SLUGID}" --description "firefox desktop builds on windows - taskcluster worker - version ${SLUGID}" | sed -n 's/^ *"ImageId": *"\(.*\)" *$/\1/p')"

  echo "$(date): The AMI is currently being created: ${IMAGE_ID}"

  PASSWORD="$(aws --region ${REGION} ec2 get-password-data --instance-id "${INSTANCE_ID}" --priv-launch-key ${REGION}.id_rsa --output text --query PasswordData)"

  echo "$(date): To connect to the template instance (please don't do so until AMI creation process is completed"'!'"):"
  echo
  echo "             Public IP: ${PUBLIC_IP}"
  echo "             Username:  Administrator"
  echo "             Password:  ${PASSWORD}"
  echo
  echo "$(date): To monitor the AMI creation process, see:"
  echo
  echo "             https://${REGION}.console.aws.amazon.com/ec2/v2/home?region=${REGION}#Images:visibility=owned-by-me;search=${IMAGE_ID};sort=desc:platform"

  echo "$(date): I've triggered the snapshot of instance ${INSTANCE_ID} as ${IMAGE_ID} - but now we will need to wait ~ an hour("'!'") for it to be created..."

  until aws --region ${REGION} ec2 wait image-available --image-ids "${IMAGE_ID}" >/dev/null 2>&1; do
    echo "$(date):   Waiting for ${IMAGE_ID} availability..."
    sleep 30
  done

  echo '#!/bin/bash' > "update_worker_type_${REGION}.sh"
  echo "${GOPATH}/bin/update-worker-type" "${REGION}" "${IMAGE_ID}" "${WORKER_TYPE}" >> "update_worker_type_${REGION}.sh"
  chmod a+x "update_worker_type_${REGION}.sh"

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

  echo
  echo "$(date): Starting instance ${INSTANCE_ID} back up..."
  if aws --region ${REGION} ec2 start-instances --instance-ids "${INSTANCE_ID}" >/dev/null 2>&1; then
    echo "$(date): Done"
  else
    echo "$(date): Could not start up instance ${INSTANCE_ID}"
  fi
}

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

# sa-east-1 doesn't support everything we need
aws ec2 describe-regions --query '{A:Regions[*].RegionName}' --output text | grep -v sa-east-1 | while read x REGION; do
  process_region "${REGION}" > "${REGION}.log" 2>&1 &
done

echo "$(date): Worker types are being created in the background: watch the log files in '$(pwd)'."
