begin
  -- lock this table before reading from it, to prevent loss of concurrent
  -- updates when the table is dropped.
  lock table cache_purges;

  create table cache_purges_entities(
    partition_key text, row_key text,
    value jsonb not null,
    version integer not null,
    etag uuid default public.gen_random_uuid());
  alter table cache_purges_entities add primary key (partition_key, row_key);

  insert into cache_purges_entities
  select
    encode_composite_key(provisioner_id, worker_type) as partition_key,
    encode_string_key(cache_name) as row_key,
    jsonb_build_object(
      'PartitionKey', encode_composite_key(provisioner_id, worker_type),
      'RowKey', encode_string_key(cache_name),
      'provisionerId', provisioner_id,
      'workerType', worker_type,
      'cacheName', cache_name,
      'before', before,
      'expires', expires) as value,
    1 as version,
    etag
  from cache_purges;

  revoke select, insert, update, delete on cache_purges from $db_user_prefix$_purge_cache;
  drop table cache_purges;
  grant select, insert, update, delete on cache_purges_entities to $db_user_prefix$_purge_cache;

  drop function get_page_limit(page_size integer);
  drop function get_page_offset(page_offset integer);
end