begin
  -- lock this table before reading from it, to prevent loss of concurrent
  -- updates when the table is dropped.
  lock table hooks_last_fires;

  create table last_fire_3_entities(
    partition_key text, row_key text,
    value jsonb not null,
    version integer not null,
    etag uuid default public.gen_random_uuid());
  alter table last_fire_3_entities add primary key (partition_key, row_key);

  insert into last_fire_3_entities
  select
    encode_composite_key(hook_group_id, hook_id) as partition_key,
    encode_string_key(task_id) as row_key,
    jsonb_build_object(
      'PartitionKey', encode_composite_key(hook_group_id, hook_id),
      'RowKey', encode_string_key(task_id),
      'hookGroupId', hook_group_id,
      'hookId', hook_id,
      'firedBy', fired_by,
      'taskId', task_id,
      'taskCreateTime', task_create_time,
      'result', result,
      'error', error) as value,
    1 as version,
    etag
  from hooks_last_fires;

  revoke select, insert, update, delete on hooks_last_fires from $db_user_prefix$_hooks;
  drop table hooks_last_fires;
  grant select, insert, update, delete on last_fire_3_entities to $db_user_prefix$_hooks;
end
