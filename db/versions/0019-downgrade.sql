begin
  -- lock this table before reading from it, to prevent loss of concurrent
  -- updates when the table is dropped.
  lock table queue_artifacts;

  raise log 'TIMING start queue_artifacts_entities create table';
  create table queue_artifacts_entities(
    partition_key text, row_key text,
    value jsonb not null,
    version integer not null,
    etag uuid default public.gen_random_uuid());

  raise log 'TIMING start queue_artifacts_entities primary key';
  alter table queue_artifacts_entities add primary key (partition_key, row_key);

  raise log 'TIMING start queue_artifacts_entities insert into';
  insert into queue_artifacts_entities
  select
    encode_composite_key(task_id, run_id::text) as partition_key,
    encode_string_key(name) as row_key,
    entity_buf_encode(
      jsonb_build_object(
        'PartitionKey', encode_composite_key(task_id, run_id::text),
        'RowKey', encode_string_key(name),
        'taskId', slugid_to_uuid(task_id),
        'runId', run_id,
        'name', name,
        'storageType', storage_type,
        'contentType', content_type,
        'present', present,
        'expires', expires),
      'details', details::text) as value,
    1 as version,
    etag
  from queue_artifacts;

  raise log 'TIMING start queue_artifacts_entities permissions';
  revoke select, insert, update, delete on queue_artifacts from $db_user_prefix$_queue;
  drop table queue_artifacts;
  grant select, insert, update, delete on queue_artifacts_entities to $db_user_prefix$_queue;
end
