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
