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

# find old amis
log "Querying previous AMI..."
OLD_SNAPSHOTS="$(aws --region "${REGION}" ec2 describe-images --owners self amazon --filters "Name=name,Values=${WORKER_TYPE} mozillabuild version*" --query 'Images[*].BlockDeviceMappings[*].Ebs.SnapshotId' --output text)"

# find old snapshots
log "Querying snapshot used in this previous AMI..."
OLD_AMIS="$(aws --region "${REGION}" ec2 describe-images --owners self amazon --filters "Name=name,Values=${WORKER_TYPE} mozillabuild version*" --query 'Images[*].ImageId' --output text)"

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

# delete old snapshot
if [ -n "${OLD_SNAPSHOTS}" ]; then
  log "Deleting the old snapshot(s) ("${OLD_SNAPSHOTS}")..."
  for snapshot in ${OLD_SNAPSHOTS}; do
    aws --region "${REGION}" ec2 delete-snapshot --snapshot-id ${snapshot}
  done
else
  log "No old snapshot to delete."
fi
