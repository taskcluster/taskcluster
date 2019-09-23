GCP_PROJECT='pmoore-dev'

# gcloud projects add-iam-policy-binding "${GCP_PROJECT}" --member serviceAccount:taskcluster-worker-manager@taskcluster-temp-workers.iam.gserviceaccount.com --role roles/compute.imageUser

cd "$(dirname "${0}")/${WORKER_TYPE}"

# Let's not create shh keys unless we have to, see: https://cloud.google.com/compute/docs/instances/adding-removing-ssh-keys
# log "Generating new ssh key..."

. ../find_old_gcp_objects.sh

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

gcloud beta compute --project="${GCP_PROJECT}" instances create "${UNIQUE_NAME}" --description="generic-worker instance for worker type ${WORKER_TYPE}" --zone="${REGION}" --machine-type=n1-standard-4 --subnet=default --network-tier=PREMIUM --metadata-from-file="${STARTUP_KEY}=${TEMP_SETUP_SCRIPT}" --no-restart-on-failure --maintenance-policy=MIGRATE --service-account=593123400364-compute@developer.gserviceaccount.com --scopes=https://www.googleapis.com/auth/devstorage.read_only,https://www.googleapis.com/auth/logging.write,https://www.googleapis.com/auth/monitoring.write,https://www.googleapis.com/auth/servicecontrol,https://www.googleapis.com/auth/service.management.readonly,https://www.googleapis.com/auth/trace.append $(cat gcp_filters) --boot-disk-device-name="${UNIQUE_NAME}" --labels="worker-type=${WORKER_TYPE},worker-implementation=generic-worker" --reservation-affinity=any --enable-display-device

log "I've triggered the creation of instance ${UNIQUE_NAME} - it can take a \x1B[4mVery Long Time™\x1B[24m for it to be created and bootstrapped..."

log "To connect to the template instance:"
log ''
log "             gcloud compute ssh ${UNIQUE_NAME} --project='${GCP_PROJECT}' --zone=${REGION}"
log ''

if [ "${PLATFORM}" == "windows" ]; then
  until gcloud compute reset-windows-password "${UNIQUE_NAME}" --zone "${REGION}"; do
    sleep 15
  done
fi

# poll for a stopped state

until [ "$(gcloud compute --project="${GCP_PROJECT}" instances describe --zone="${REGION}" "${UNIQUE_NAME}" --format='table[no-heading](status)')" == 'TERMINATED' ]; do
  log "  Waiting for instance ${UNIQUE_NAME} to shut down..."
  sleep 15
done

rm "${TEMP_SETUP_SCRIPT}"

log "Now creating an image from the terminated instance..."
# gcloud compute disks snapshot "${UNIQUE_NAME}" --project="${GCP_PROJECT}" --description="my description" --labels="key1=value1" --snapshot-names="${UNIQUE_NAME}" --zone="${REGION}" --storage-location=us
gcloud compute images create "${UNIQUE_NAME}" --source-disk="${UNIQUE_NAME}" --source-disk-zone="${REGION}" --labels="worker-type=${WORKER_TYPE},worker-implementation=generic-worker"

log ''
log "The image is being created here:"
log ''
log "             https://console.cloud.google.com/compute/imagesDetail/projects/${GCP_PROJECT}/global/images/${UNIQUE_NAME}?project=${GCP_PROJECT}&authuser=1&supportedpurview=project"

until [ "$(gcloud compute --project="${GCP_PROJECT}" images describe "${UNIQUE_NAME}" --format='table[no-heading](status)')" == 'READY' ]; do
  log "  Waiting for image ${UNIQUE_NAME} to be created..."
  sleep 15
done

. ../delete_gcp.sh
