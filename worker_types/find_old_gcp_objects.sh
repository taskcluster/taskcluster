log "Querying old instances..."
OLD_INSTANCES="$(gcloud compute instances list --project="${GCP_PROJECT}" --filter="labels.worker-type=${WORKER_TYPE} AND labels.worker-implementation=generic-worker AND zone:${REGION}" --format='table[no-heading](name)')"
if [ -n "${OLD_INSTANCES}" ]; then
  log "Found old instances:" $OLD_INSTANCES
else
  log "WARNING: No old instances found"
fi

log "Querying previous images..."
OLD_IMAGES="$(gcloud compute images list --project="${GCP_PROJECT}" --filter="labels.worker-type=${WORKER_TYPE} AND labels.worker-implementation=generic-worker" --format='table[no-heading](name)')"
if [ -n "${OLD_IMAGES}" ]; then
  log "Found old images:" $OLD_IMAGES
else
  log "WARNING: No old images found"
fi
