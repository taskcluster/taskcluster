begin
  -- lock this table before reading from it, to prevent loss of concurrent
  -- updates when the table is dropped.
  lock table queue_workers;

  create table queue_worker_entities(
    partition_key text, row_key text,
    value jsonb not null,
    version integer not null,
    etag uuid default public.gen_random_uuid());
  alter table queue_worker_entities add primary key (partition_key, row_key);

  insert into queue_worker_entities
  select
    encode_composite_key(provisioner_id, worker_type) as partition_key,
    encode_composite_key(worker_group, worker_id) as row_key,
    entity_buf_encode(
      jsonb_build_object(
        'PartitionKey', encode_composite_key(provisioner_id, worker_type),
        'RowKey', encode_composite_key(worker_group, worker_id),
        'provisionerId', provisioner_id,
        'workerType', worker_type,
        'workerGroup', worker_group,
        'workerId', worker_id,
        'quarantineUntil', quarantine_until,
        'expires', expires,
        'firstClaim', first_claim),
      'recentTasks', recent_tasks::text) as value,
    1 as version,
    etag
  from queue_workers;

  revoke select, insert, update, delete on queue_workers from $db_user_prefix$_queue;
  drop table queue_workers;
  grant select, insert, update, delete on queue_worker_entities to $db_user_prefix$_queue;
end
