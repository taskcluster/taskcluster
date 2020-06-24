begin
  -- lock this table before reading from it, to prevent loss of concurrent
  -- updates when the table is dropped.
  lock table task_groups;

  create table queue_task_groups_entities(
    partition_key text, row_key text,
    value jsonb not null,
    version integer not null,
    etag uuid default public.gen_random_uuid());
  alter table queue_task_groups_entities add primary key (partition_key, row_key);

  insert into queue_task_groups_entities
  select
    task_group_id as partition_key,
    'task-group' as row_key,
    jsonb_build_object(
      'PartitionKey', task_group_id,
      'RowKey', 'task-group',
      'taskGroupId', slugid_to_uuid(task_group_id),
      'schedulerId', scheduler_id,
      'expires', expires) as value,
    1 as version,
    task_groups.etag as etag
  from task_groups;

  revoke select, insert, update, delete on task_groups from $db_user_prefix$_queue;
  drop table task_groups;

  grant select, insert, update, delete on queue_task_groups_entities to $db_user_prefix$_queue;
end
