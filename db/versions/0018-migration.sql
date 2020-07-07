begin
  -- lock this table before reading from it, to prevent loss of concurrent
  -- updates when the table is dropped.  Note that this may lead to concurrent
  -- updates failing; the important thing is that they not succeed without
  -- taking effect.  Failed updates will be retried.
  lock table last_fire_3_entities;

  create table hooks_last_fires
  as
    select
      (value ->> 'hookGroupId')::text as hook_group_id,
      (value ->> 'hookId')::text as hook_id,
      (value ->> 'firedBy')::text as fired_by,
      (value ->> 'taskId')::text as task_id,
      (value ->> 'taskCreateTime')::timestamptz as task_create_time,
      (value ->> 'result')::text as result,
      (value ->> 'error')::text as error,
      etag
    from last_fire_3_entities;
  alter table hooks_last_fires add primary key (hook_group_id, hook_id, task_id);
  alter table hooks_last_fires
    alter column hook_group_id set not null,
    alter column hook_id set not null,
    alter column fired_by set not null,
    alter column task_id set not null,
    alter column task_create_time set not null,
    alter column result set not null,
    alter column error set not null,
    alter column etag set not null,
    alter column etag set default public.gen_random_uuid();

  revoke select, insert, update, delete on last_fire_3_entities from $db_user_prefix$_hooks;
  drop table last_fire_3_entities;
  grant select, insert, update, delete on hooks_last_fires to $db_user_prefix$_hooks;

end
