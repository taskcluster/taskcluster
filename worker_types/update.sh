cd "$(dirname "${0}")/${WORKER_TYPE}"

log "Generating new ssh key..."
rm -rf "${REGION}.id_rsa"
aws --region "${REGION}" ec2 delete-key-pair --key-name "${WORKER_TYPE}_${REGION}" || true
aws --region "${REGION}" ec2 create-key-pair --key-name "${WORKER_TYPE}_${REGION}" --query 'KeyMaterial' --output text > "${REGION}.id_rsa"
chmod 400 "${REGION}.id_rsa"

# aws cli docs lie, they say userdata must be base64 encoded, but cli encodes for you, so just cat it...
USER_DATA="$(cat userdata)"
AMI_BASE_NAME="$(cat ami-base-name)"

# find out latest windows 2012 r2 ami to use...
AMI_METADATA="$(aws --region "${REGION}" ec2 describe-images --owners self amazon --filters "Name=platform,Values=windows" "Name=name,Values=${AMI_BASE_NAME}" --query 'Images[*].{A:CreationDate,B:ImageId,C:Name}' --output text | sort -u | tail -1 | cut -f2,3)"

AMI="$(echo $AMI_METADATA | sed 's/ .*//')"
AMI_NAME="$(echo $AMI_METADATA | sed 's/.* //')"
log "Base AMI is: ${AMI} ('${AMI_NAME}')"

. ../find_old_aws_objects.sh

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
INSTANCE_ID="$(aws --region "${REGION}" ec2 run-instances --image-id "${AMI}" --key-name "${WORKER_TYPE}_${REGION}" --security-groups "rdp-only" "ssh-only" --user-data "$(cat userdata)" --instance-type c4.2xlarge --block-device-mappings DeviceName=/dev/sda1,Ebs='{VolumeSize=75,DeleteOnTermination=true,VolumeType=gp2}' --instance-initiated-shutdown-behavior stop --client-token "${SLUGID}" --query 'Instances[*].InstanceId' --output text)"

log "I've triggered the creation of instance ${INSTANCE_ID} - it can take a \x1B[4mVery Long Time™\x1B[24m for it to be created and bootstrapped..."
aws --region "${REGION}" ec2 create-tags --resources "${INSTANCE_ID}" --tags "Key=WorkerType,Value=aws-provisioner-v1/${WORKER_TYPE}" "Key=Name,Value=${WORKER_TYPE} base instance" "Key=TC-Windows-Base,Value=true"
log "I've tagged it with \"WorkerType\": \"aws-provisioner-v1/${WORKER_TYPE}\""

# grab public IP before it shuts down and loses it!
PUBLIC_IP="$(aws --region "${REGION}" ec2 describe-instances --instance-id "${INSTANCE_ID}" --query 'Reservations[*].Instances[*].NetworkInterfaces[*].Association.PublicIp' --output text)"

# poll for a stopped state
until aws --region "${REGION}" ec2 wait instance-stopped --instance-ids "${INSTANCE_ID}" >/dev/null 2>&1; do
  log "  Waiting for instance ${INSTANCE_ID} to shut down..."
  sleep 30
done

log "Now snapshotting the instance to create an AMI..."
# now capture the AMI
IMAGE_ID="$(aws --region "${REGION}" ec2 create-image --instance-id "${INSTANCE_ID}" --name "${WORKER_TYPE} mozillabuild version ${SLUGID}" --description "firefox desktop builds on windows - taskcluster worker - version ${SLUGID}" --output text)"

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

{
    echo "Instance:  ${INSTANCE_ID}"
    echo "Public IP: ${PUBLIC_IP}"
    echo "Password:  ${PASSWORD}"
    echo "AMI:       ${IMAGE_ID}"
} > "${REGION}.secrets"

. ../delete.sh

# log ''
# log "Starting instance ${INSTANCE_ID} back up..."
# if aws --region "${REGION}" ec2 start-instances --instance-ids "${INSTANCE_ID}" >/dev/null 2>&1; then
#   log "Done"
# else
#   log "Could not start up instance ${INSTANCE_ID}"
# fi
