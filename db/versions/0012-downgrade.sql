begin
  -- lock this table before reading from it, to prevent loss of concurrent
  -- updates when the table is dropped.
  lock table workers;

  create table wmworkers_entities(
    partition_key text, row_key text,
    value jsonb not null,
    version integer not null,
    etag uuid default public.gen_random_uuid());
  alter table wmworkers_entities add primary key (partition_key, row_key);

  insert into wmworkers_entities
  select
    encode_string_key(worker_pool_id) as partition_key,
    encode_composite_key(worker_group, worker_id) as row_key,
    entity_buf_encode(
        jsonb_build_object(
          'PartitionKey', encode_string_key(worker_pool_id),
          'RowKey', 'workerPool',
          'workerPoolId', worker_pool_id,
          'workerGroup', worker_group,
          'workerId', worker_id,
          'providerId', provider_id,
          'created', created,
          'expires', expires,
          'state', state,
          'capacity', capacity,
          'lastModified', last_modified,
          'lastChecked', last_checked),
        'providerData', provider_data::text) as value,
    1 as version,
    etag
  from workers;

  revoke select, insert, update, delete on workers from $db_user_prefix$_worker_manager;
  drop table workers;
  grant select, insert, update, delete on wmworkers_entities to $db_user_prefix$_worker_manager;
end