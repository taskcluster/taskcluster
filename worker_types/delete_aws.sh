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
