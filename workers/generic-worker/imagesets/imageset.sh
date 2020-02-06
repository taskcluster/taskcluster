#!/bin/bash -e

function log {
    if [ -n "${REGION}" ]; then
        echo -e "\x1B[38;5;${COLOUR}m$(basename "${0}"): $(date): ${CLOUD}: ${IMAGE_SET}: ${REGION}: ${@}\x1B[0m"
    else
        echo -e "\x1B[38;5;188m$(basename "${0}"): $(date): ${@}\x1B[0m"
    fi
}

function deploy {
    log "Checking inputs..."

    if [ "${#}" -ne 3 ]; then
        log "Please specify a cloud (aws/gcp), action (delete|update), and image set (e.g. generic-worker-win2012r2) e.g. ${0} aws update generic-worker-win2012r2" >&2
        exit 64
    fi

    export CLOUD="${1}"
    if [ "${CLOUD}" != "aws" ] && [ "${CLOUD}" != "gcp" ]; then
        log "provider must be 'aws' or 'gcp' but '${CLOUD}' was specified" >&2
        exit 65
    fi

    ACTION="${2}"
    if [ "${ACTION}" != "update" ] && [ "${ACTION}" != "delete" ]; then
        log "action must be 'delete' or 'update' but '${ACTION}' was specified" >&2
        exit 66
    fi

    export IMAGE_SET="${3}"

    log 'Starting!'

    export IMAGE_SET_COMMIT_SHA="$(git rev-parse HEAD)"

    # UUID is 20 random chars of [a-z0-9]
    UUID="$(LC_CTYPE=C </dev/urandom tr -dc "a-z0-9" | head -c 20)"
    export UNIQUE_NAME="${IMAGE_SET}-${UUID}"

    case "${CLOUD}" in
        aws) 
            echo us-west-1 118 us-west-2 199 us-east-1 100 | xargs -P3 -n2 "${0}" process-region "${CLOUD}_${ACTION}"
            ;;
        gcp)
            if [ "${GCP_PROJECT}" == "" ]; then
                log "env variable GCP_PROJECT must be exported before calling this script" >&2
                exit 67
            fi
            echo us-central1-a 118 | xargs -P1 -n2 "${0}" process-region "${CLOUD}_${ACTION}"
            ;;
    esac

    log 'Deployment of image sets successful!'
}

################## AWS ##################

function aws_delete {
    aws_find_old_objects
    aws_delete_found
}

function aws_find_old_objects {
    # query old instances
    log "Querying old instances..."
    OLD_INSTANCES="$(aws --region "${REGION}" ec2 describe-instances --filters "Name=tag:ImageSet,Values=${IMAGE_SET}" --query 'Reservations[*].Instances[*].InstanceId' --output text)"

    # find old amis
    log "Querying previous AMI..."
    OLD_SNAPSHOTS="$(aws --region "${REGION}" ec2 describe-images --owners self --filters "Name=name,Values=${IMAGE_SET} *" --query 'Images[*].BlockDeviceMappings[*].Ebs.SnapshotId' --output text)"

    # find old snapshots
    log "Querying snapshot used in this previous AMI..."
    OLD_AMIS="$(aws --region "${REGION}" ec2 describe-images --owners self --filters "Name=name,Values=${IMAGE_SET} *" --query 'Images[*].ImageId' --output text)"
}

function aws_delete_found {
    # terminate old instances
    if [ -n "${OLD_INSTANCES}" ]; then
        log "Now terminating instances" ${OLD_INSTANCES}...
        aws --region "${REGION}" ec2 terminate-instances --instance-ids ${OLD_INSTANCES} >/dev/null 2>&1
    else
        log "No previous instances to terminate."
    fi

    # deregister old AMIs
    if [ -n "${OLD_AMIS}" ]; then
        log "Deregistering the old AMI(s) ("${OLD_AMIS}")..."
        # note this can fail if it is already in process of being deregistered, so allow to fail...
        for image in ${OLD_AMIS}; do
            aws --region "${REGION}" ec2 deregister-image --image-id "${image}" 2>/dev/null || true
        done
    else
        log "No old AMI to deregister."
    fi

    # delete old snapshots
    if [ -n "${OLD_SNAPSHOTS}" ]; then
        log "Deleting the old snapshot(s) ("${OLD_SNAPSHOTS}")..."
        for snapshot in ${OLD_SNAPSHOTS}; do
            aws --region "${REGION}" ec2 delete-snapshot --snapshot-id ${snapshot}
        done
    else
        log "No old snapshot to delete."
    fi
}

function aws_update {

    log "Generating new ssh key..."
    rm -rf "${CLOUD}.${REGION}.id_rsa"
    aws --region "${REGION}" ec2 delete-key-pair --key-name "${IMAGE_SET}_${REGION}" || true
    aws --region "${REGION}" ec2 create-key-pair --key-name "${IMAGE_SET}_${REGION}" --query 'KeyMaterial' --output text > "${CLOUD}.${REGION}.id_rsa"
    chmod 400 "${CLOUD}.${REGION}.id_rsa"

    # search for latest base AMI to use
    AMI_METADATA="$(aws --region "${REGION}" ec2 describe-images --owners $(cat aws_owners) --filters $(cat aws_filters) --query 'Images[*].{A:CreationDate,B:ImageId,C:Name}' --output text | sort -u | tail -1 | cut -f2,3)"

    AMI="$(echo $AMI_METADATA | sed 's/ .*//')"
    AMI_NAME="$(echo $AMI_METADATA | sed 's/.* //')"
    log "Base AMI is: ${AMI} ('${AMI_NAME}')"

    aws_find_old_objects

    TEMP_SETUP_SCRIPT="$(mktemp -t ${UNIQUE_NAME}.XXXXXXXXXX)"

    if [ -f "bootstrap.ps1" ]; then
        echo '<powershell>' >> "${TEMP_SETUP_SCRIPT}"
        cat bootstrap.ps1 | sed 's/%MY_CLOUD%/aws/g' >> "${TEMP_SETUP_SCRIPT}"
        echo '</powershell>' >> "${TEMP_SETUP_SCRIPT}"
        IMAGE_OS=windows
    else
        cat bootstrap.sh | sed 's/%MY_CLOUD%/aws/g' >> "${TEMP_SETUP_SCRIPT}"
        IMAGE_OS=linux
    fi

    # Make sure we have an ssh security group in this region note if we *try* to
    # create a security group that already exists (regardless of whether it is
    # successful or not), there will be a cloudwatch alarm, so avoid this by
    # checking first.
    echo 'ssh-only 22 SSH only
    rdp-only 3389 RDP only' | while read group_name port description; do
        if ! aws --region "${REGION}" ec2 describe-security-groups --group-names "${group_name}" >/dev/null 2>&1; then
            SECURITY_GROUP="$(aws --region "${REGION}" ec2 create-security-group --group-name "${group_name}" --description "${description}" --output text 2>/dev/null || true)"
            aws --region "${REGION}" ec2 authorize-security-group-ingress --group-id "${SECURITY_GROUP}" --ip-permissions '[{"IpProtocol": "tcp", "FromPort": '"${port}"', "ToPort": '"${port}"', "IpRanges": [{"CidrIp": "0.0.0.0/0"}]}]'
        fi
    done

    # Create new base AMI, and apply user-data filter output, to get instance ID.
    INSTANCE_ID="$(aws --region "${REGION}" ec2 run-instances --image-id "${AMI}" --key-name "${IMAGE_SET}_${REGION}" --security-groups "rdp-only" "ssh-only" --user-data "$(cat "${TEMP_SETUP_SCRIPT}")" --instance-type c4.2xlarge --block-device-mappings DeviceName=/dev/sda1,Ebs='{VolumeSize=75,DeleteOnTermination=true,VolumeType=gp2}' --instance-initiated-shutdown-behavior stop --client-token "${UNIQUE_NAME}" --query 'Instances[*].InstanceId' --output text)"

    log "I've triggered the creation of instance ${INSTANCE_ID} - it can take a \x1B[4mVery Long Time™\x1B[24m for it to be created and bootstrapped..."
    aws --region "${REGION}" ec2 create-tags --resources "${INSTANCE_ID}" --tags "Key=ImageSet,Value=${IMAGE_SET}" "Key=Name,Value=${IMAGE_SET} base instance ${IMAGE_SET_COMMIT_SHA}" "Key=TC-Windows-Base,Value=true"
    log "I've tagged it with \"ImageSet\": \"${IMAGE_SET}\""

    sleep 1

    # grab public IP before it shuts down and loses it!
    PUBLIC_IP="$(aws --region "${REGION}" ec2 describe-instances --instance-id "${INSTANCE_ID}" --query 'Reservations[*].Instances[*].NetworkInterfaces[*].Association.PublicIp' --output text)"

    if [ "${IMAGE_OS}" == "windows" ]; then
        until [ -n "${PASSWORD}" ]; do
            log "    Waiting for Windows Password from ${INSTANCE_ID} (IP ${PUBLIC_IP})..."
            sleep 10
            PASSWORD="$(aws --region "${REGION}" ec2 get-password-data --instance-id "${INSTANCE_ID}" --priv-launch-key ${CLOUD}.${REGION}.id_rsa --output text --query PasswordData 2>/dev/null || true)"
        done
    fi

    log "To connect to the template instance (please don't do so until AMI creation process is completed"'!'"):"
    log ''

    if [ "${IMAGE_OS}" == "windows" ]; then
        log "                         Public IP:   ${PUBLIC_IP}"
        log "                         Username:    Administrator"
        log "                         Password:    ${PASSWORD}"
    else
        # linux
        log "                         ssh -i '$(pwd)/${CLOUD}.${REGION}.id_rsa' ubuntu@${PUBLIC_IP}"
    fi

    # poll for a stopped state
    until aws --region "${REGION}" ec2 wait instance-stopped --instance-ids "${INSTANCE_ID}" >/dev/null 2>&1; do
        log "    Waiting for instance ${INSTANCE_ID} (IP ${PUBLIC_IP}) to shut down..."
        sleep 30
    done

    rm "${TEMP_SETUP_SCRIPT}"

    log "Now snapshotting the instance to create an AMI..."
    # now capture the AMI
    IMAGE_ID="$(aws --region "${REGION}" ec2 create-image --instance-id "${INSTANCE_ID}" --name "${IMAGE_SET} version ${IMAGE_SET_COMMIT_SHA}" --description "${IMAGE_SET} version ${IMAGE_SET_COMMIT_SHA}" --output text)"

    log "The AMI is currently being created: ${IMAGE_ID}"

    log ''
    log "To monitor the AMI creation process, see:"
    log ''
    log "                         https://${REGION}.console.aws.amazon.com/ec2/v2/home?region=${REGION}#Images:visibility=owned-by-me;search=${IMAGE_ID};sort=desc:platform"

    log "I've triggered the snapshot of instance ${INSTANCE_ID} as ${IMAGE_ID} - but now we will need to wait a \x1B[4mVery Long Time™\x1B[24m for it to be created..."

    until aws --region "${REGION}" ec2 wait image-available --image-ids "${IMAGE_ID}" >/dev/null 2>&1; do
        log "    Waiting for ${IMAGE_ID} availability..."
        sleep 30
    done

    touch "${REGION}.${IMAGE_ID}.latest-image"

    {
            echo "Instance:    ${INSTANCE_ID}"
            echo "Public IP: ${PUBLIC_IP}"
            [ -n "${PASSWORD}" ] && echo "Password:    ${PASSWORD}"
            echo "AMI:             ${IMAGE_ID}"
    } > "${REGION}.secrets"

    aws_delete_found
}


################## GCP ##################

function gcp_delete {
    gcp_find_old_objects
    gcp_delete_found
}

function gcp_find_old_objects {
    log "Querying old instances..."
    OLD_INSTANCES="$(gcloud compute instances list --project="${GCP_PROJECT}" --filter="labels.image-set=${IMAGE_SET} AND zone:${REGION}" --format='table[no-heading](name)')"
    if [ -n "${OLD_INSTANCES}" ]; then
        log "Found old instances:" $OLD_INSTANCES
    else
        log "WARNING: No old instances found"
    fi

    log "Querying previous images..."
    OLD_IMAGES="$(gcloud compute images list --project="${GCP_PROJECT}" --filter="labels.image-set=${IMAGE_SET}" --format='table[no-heading](name)')"
    if [ -n "${OLD_IMAGES}" ]; then
        log "Found old images:" $OLD_IMAGES
    else
        log "WARNING: No old images found"
    fi
}

function gcp_delete_found {
    # terminate old instances
    if [ -n "${OLD_INSTANCES}" ]; then
        log "Now terminating instances" ${OLD_INSTANCES}...
        gcloud compute instances delete ${OLD_INSTANCES} --zone="${REGION}" --delete-disks=all
    else
        log "No previous instances to terminate."
    fi

    # delete old images
    if [ -n "${OLD_IMAGES}" ]; then
        log "Deleting the old image(s) ("${OLD_IMAGES}")..."
        gcloud compute images delete ${OLD_IMAGES}
    else
        log "No old snapshot to delete."
    fi
}

function gcp_update {

    # NOTE: to grant permission for community-tc worker manager to use images in your GCP project, run: 
    # gcloud projects add-iam-policy-binding "${GCP_PROJECT}" --member serviceAccount:taskcluster-worker-manager@taskcluster-temp-workers.iam.gserviceaccount.com --role roles/compute.imageUser

    # Prefer no shh keys, see: https://cloud.google.com/compute/docs/instances/adding-removing-ssh-keys

    gcp_find_old_objects

    TEMP_SETUP_SCRIPT="$(mktemp -t ${UNIQUE_NAME}.XXXXXXXXXX)"

    if [ -f "bootstrap.ps1" ]; then
        PLATFORM=windows
        echo '&{' >> "${TEMP_SETUP_SCRIPT}"
        cat bootstrap.ps1 | sed 's/%MY_CLOUD%/gcp/g' >> "${TEMP_SETUP_SCRIPT}"
        echo '} 5>&1 4>&1 3>&1 2>&1 > C:\update_gcp.log' >> "${TEMP_SETUP_SCRIPT}"
        STARTUP_KEY=windows-startup-script-ps1
    else
        PLATFORM=linux
        cat bootstrap.sh | sed 's/%MY_CLOUD%/gcp/g' >> "${TEMP_SETUP_SCRIPT}"
        STARTUP_KEY=startup-script
    fi

    gcloud beta compute --project="${GCP_PROJECT}" instances create "${UNIQUE_NAME}" --description="instance for image set ${IMAGE_SET}" --zone="${REGION}" --machine-type=n1-standard-4 --subnet=default --network-tier=PREMIUM --metadata-from-file="${STARTUP_KEY}=${TEMP_SETUP_SCRIPT}" --no-restart-on-failure --maintenance-policy=MIGRATE --service-account=593123400364-compute@developer.gserviceaccount.com --scopes=https://www.googleapis.com/auth/devstorage.read_only,https://www.googleapis.com/auth/logging.write,https://www.googleapis.com/auth/monitoring.write,https://www.googleapis.com/auth/servicecontrol,https://www.googleapis.com/auth/service.management.readonly,https://www.googleapis.com/auth/trace.append $(cat gcp_filters) --boot-disk-device-name="${UNIQUE_NAME}" --labels="image-set=${IMAGE_SET}" --reservation-affinity=any --enable-display-device

    log "I've triggered the creation of instance ${UNIQUE_NAME} - it can take a \x1B[4mVery Long Time™\x1B[24m for it to be created and bootstrapped..."

    log "To connect to the template instance:"
    log ''
    log "                         gcloud compute ssh ${UNIQUE_NAME} --project='${GCP_PROJECT}' --zone=${REGION}"
    log ''

    if [ "${PLATFORM}" == "windows" ]; then
        until gcloud compute reset-windows-password "${UNIQUE_NAME}" --zone "${REGION}"; do
            sleep 15
        done
    fi

    # poll for a stopped state

    until [ "$(gcloud compute --project="${GCP_PROJECT}" instances describe --zone="${REGION}" "${UNIQUE_NAME}" --format='table[no-heading](status)')" == 'TERMINATED' ]; do
        log "    Waiting for instance ${UNIQUE_NAME} to shut down..."
        sleep 15
    done

    rm "${TEMP_SETUP_SCRIPT}"

    log "Now creating an image from the terminated instance..."
    # gcloud compute disks snapshot "${UNIQUE_NAME}" --project="${GCP_PROJECT}" --description="my description" --labels="key1=value1" --snapshot-names="${UNIQUE_NAME}" --zone="${REGION}" --storage-location=us
    gcloud compute images create "${UNIQUE_NAME}" --source-disk="${UNIQUE_NAME}" --source-disk-zone="${REGION}" --labels="image-set=${IMAGE_SET}"

    log ''
    log "The image is being created here:"
    log ''
    log "                         https://console.cloud.google.com/compute/imagesDetail/projects/${GCP_PROJECT}/global/images/${UNIQUE_NAME}?project=${GCP_PROJECT}&authuser=1&supportedpurview=project"

    until [ "$(gcloud compute --project="${GCP_PROJECT}" images describe "${UNIQUE_NAME}" --format='table[no-heading](status)')" == 'READY' ]; do
        log "    Waiting for image ${UNIQUE_NAME} to be created..."
        sleep 15
    done

    gcp_delete_found
}



################## Entry point ##################

if [ "${1}" == "process-region" ]; then
    # Step into directory containing image set definition.
    cd "$(dirname "${0}")/${IMAGE_SET}"
    REGION="${3}"
    COLOUR="${4}"
    "${2}"
    exit 0
fi

deploy "${@}"
