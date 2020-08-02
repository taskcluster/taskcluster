begin
  -- lock this table before reading from it, to prevent loss of concurrent
  -- updates when the table is dropped.
  lock table queue_worker_types;

  create table queue_worker_type_entities(
    partition_key text, row_key text,
    value jsonb not null,
    version integer not null,
    etag uuid default public.gen_random_uuid());
  alter table queue_worker_type_entities add primary key (partition_key, row_key);

  insert into queue_worker_type_entities
  select
    encode_string_key(provisioner_id) as partition_key,
    encode_string_key(worker_type) as row_key,
    entity_buf_encode(
      jsonb_build_object(
        'PartitionKey', encode_string_key(provisioner_id),
        'RowKey', encode_string_key(worker_type),
        'provisionerId', provisioner_id,
        'workerType', worker_type,
        'expires', expires,
        'lastDateActive', last_date_active,
        'stability', stability),
      'description', description::text) as value,
    1 as version,
    etag
  from queue_worker_types;

  revoke select, insert, update, delete on queue_worker_types from $db_user_prefix$_queue;
  drop table queue_worker_types;
  grant select, insert, update, delete on queue_worker_type_entities to $db_user_prefix$_queue;
end
