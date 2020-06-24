begin
  -- lock this table before reading from it, to prevent loss of concurrent
  -- updates when the table is dropped.  Note that this may lead to concurrent
  -- updates failing; the important thing is that they not succeed without
  -- taking effect.  Failed updates will be retried.
  lock table queue_task_groups_entities;

  create table task_groups
  as
    select
      uuid_to_slugid(value ->> 'taskGroupId')::text as task_group_id,
      (value ->> 'schedulerId')::text as scheduler_id,
      (value ->> 'expires')::timestamptz as expires,
      queue_task_groups_entities.etag as etag
    from queue_task_groups_entities;
  alter table task_groups add primary key (task_group_id);

  alter table task_groups
    alter column task_group_id set not null,
    alter column scheduler_id set not null,
    alter column expires set not null,
    alter column etag set not null;

  revoke select, insert, update, delete on queue_task_groups_entities from $db_user_prefix$_queue;
  drop table queue_task_groups_entities;

  grant select, insert, update, delete on task_groups to $db_user_prefix$_queue;
end
