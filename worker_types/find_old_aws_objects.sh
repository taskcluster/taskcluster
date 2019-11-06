# query old instances
log "Querying old instances..."
OLD_INSTANCES="$(aws --region "${REGION}" ec2 describe-instances --filters "Name=tag:WorkerType,Values=${WORKER_POOL}" --query 'Reservations[*].Instances[*].InstanceId' --output text)"

# find old amis
log "Querying previous AMI..."
OLD_SNAPSHOTS="$(aws --region "${REGION}" ec2 describe-images --owners self amazon --filters "Name=name,Values=${WORKER_TYPE} generic-worker version*" --query 'Images[*].BlockDeviceMappings[*].Ebs.SnapshotId' --output text)"

# find old snapshots
log "Querying snapshot used in this previous AMI..."
OLD_AMIS="$(aws --region "${REGION}" ec2 describe-images --owners self amazon --filters "Name=name,Values=${WORKER_TYPE} generic-worker version*" --query 'Images[*].ImageId' --output text)"
