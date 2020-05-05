begin
  -- lock this table before reading from it, to prevent loss of concurrent
  -- updates when the table is dropped.
  lock table worker_pools;

  create table wmworker_pools_entities(
    partition_key text, row_key text,
    value jsonb not null,
    version integer not null,
    etag uuid default public.gen_random_uuid());
  alter table wmworker_pools_entities add primary key (partition_key, row_key);

  insert into wmworker_pools_entities
  select
    encode_string_key(worker_pool_id) as partition_key,
    'workerPool' as row_key,
    entity_buf_encode(
      entity_buf_encode(
        entity_buf_encode(
          jsonb_build_object(
            'PartitionKey', encode_string_key(worker_pool_id),
            'RowKey', 'workerPool',
            'workerPoolId', worker_pool_id,
            'providerId', provider_id,
            'owner', owner,
            'description', description,
            'emailOnError', email_on_error,
            'created', created,
            'lastModified', last_modified),
          'config', config::text),
        'providerData', provider_data::text),
      'previousProviderIds', previous_provider_ids::text) as value,
    1 as version,
    etag
  from worker_pools;

  revoke select, insert, update, delete on worker_pools from $db_user_prefix$_worker_manager;
  drop table worker_pools;
  grant select, insert, update, delete on wmworker_pools_entities to $db_user_prefix$_worker_manager;
end
