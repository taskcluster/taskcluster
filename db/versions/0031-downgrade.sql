begin
  -- lock this table before reading from it, to prevent loss of concurrent
  -- updates when the table is dropped.
  lock table worker_pool_errors;

  create table wmworker_pool_errors_entities(
    partition_key text, row_key text,
    value jsonb not null,
    version integer not null,
    etag uuid default public.gen_random_uuid());
  alter table wmworker_pool_errors_entities add primary key (partition_key, row_key);

  insert into wmworker_pool_errors_entities
  select
    encode_string_key(error_id) as partition_key,
    encode_string_key(error_id) as row_key,
    entity_buf_encode(
      jsonb_build_object(
        'PartitionKey', encode_string_key(error_id),
        'RowKey', encode_string_key(error_id),
        'errorId', error_id,
        'workerPoolId', worker_pool_id,
        'reported', reported,
        'kind', kind,
        'title', title,
        'description', description),
      'extra', extra::text) as value,
    1 as version,
    etag
  from worker_pool_errors;

  revoke select, insert, update, delete on worker_pool_errors from $db_user_prefix$_worker_manager;
  drop table worker_pool_errors;
  grant select, insert, update, delete on wmworker_pool_errors_entities to $db_user_prefix$_worker_manager;
end
