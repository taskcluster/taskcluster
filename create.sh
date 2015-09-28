#!/bin/bash -exv

# cd into directory containing script...
cd "$(dirname "${0}")"

# generate a random slugid for aws client token...
go get github.com/taskcluster/slugid-go/slug
SLUGID=$("${GOPATH}/bin/slug")

# aws cli docs lie, they say userdata must be base64 encoded, but cli encodes for you, so just cat it...
USER_DATA="$(cat firefox.userdata)"

# create base ami, and apply user-data
# filter output, to get INSTANCE_ID
INSTANCE_ID="$(aws --region us-west-2 ec2 run-instances --image-id ami-4dbcb67d --key-name pmoore-oregan-us-west-2 --security-groups "RDP only" --user-data "$(cat firefox.userdata)" --instance-type c4.2xlarge --block-device-mappings DeviceName=/dev/sda1,Ebs='{VolumeSize=75,DeleteOnTermination=true,VolumeType=gp2}' --instance-initiated-shutdown-behavior terminate --client-token "${SLUGID}" | sed -n 's/^ *"InstanceId": "\(.*\)", */\1/p')"

# sleep an hour, the installs take forever...
sleep 3600

# now capture the AMI
IMAGE_ID="$(aws --region us-west-2 ec2 create-image --instance-id "${INSTANCE_ID}" --name "win2012r2 mozillabuild pmoore version ${SLUGID}" --description "firefox desktop builds on windows - taskcluster worker - version ${SLUGID}" | sed -n 's/^ *"ImageId": *"\(.*\)" *$/\1/p')"

# TODO: now update worker type...
echo "Worker type ami to be used: '${IMAGE_ID}'"
