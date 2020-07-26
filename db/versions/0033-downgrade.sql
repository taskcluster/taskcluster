begin
  -- lock this table before reading from it, to prevent loss of concurrent
  -- updates when the table is dropped.
  lock table hooks_queues;

  create table queues_entities(
    partition_key text, row_key text,
    value jsonb not null,
    version integer not null,
    etag uuid default public.gen_random_uuid());
  alter table queues_entities add primary key (partition_key, row_key);

  insert into queues_entities
  select
    encode_string_key(hook_group_id) as partition_key,
    encode_string_key(hook_id) as row_key,
    entity_buf_encode(
        jsonb_build_object(
          'PartitionKey', encode_string_key(hook_group_id),
          'RowKey', encode_string_key(hook_id),
          'hookGroupId', hook_group_id,
          'hookId', hook_id,
          'queueName', queue_name),
        'bindings', bindings::text) as value,
    1 as version,
    etag
  from hooks_queues;

  revoke select, insert, update, delete on hooks_queues from $db_user_prefix$_hooks;
  drop table hooks_queues;
  grant select, insert, update, delete on queues_entities to $db_user_prefix$_hooks;
end
