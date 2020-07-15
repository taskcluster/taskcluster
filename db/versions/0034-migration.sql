begin
  -- lock this table before reading from it, to prevent loss of concurrent
  -- updates when the table is dropped.  Note that this may lead to concurrent
  -- updates failing; the important thing is that they not succeed without
  -- taking effect.  Failed updates will be retried.
  lock table hooks_entities;

  create table hooks
  as
    select
      (value ->> 'hookGroupId')::text as hook_group_id,
      (value ->> 'hookId')::text as hook_id,
      entity_buf_decode(value, 'metadata')::jsonb as metadata,
      entity_buf_decode(value, 'task')::jsonb as task,
      entity_buf_decode(value, 'bindings')::jsonb as bindings,
      entity_buf_decode(value, 'schedule')::jsonb as schedule,
      entity_to_crypto_container_v0(value, 'triggerToken') as trigger_token,
      entity_to_crypto_container_v0(value, 'nextTaskId') as next_task_id,
      (value ->> 'nextScheduledDate')::timestamptz as next_scheduled_date,
      entity_buf_decode(value, 'triggerSchema')::jsonb as trigger_schema,
      etag
    from hooks_entities;
  alter table hooks add primary key (hook_group_id, hook_id);
  alter table hooks
    alter column hook_group_id set not null,
    alter column hook_id set not null,
    alter column metadata set not null,
    alter column task set not null,
    alter column bindings set not null,
    alter column schedule set not null,
    alter column trigger_token set not null,
    alter column next_task_id set not null,
    alter column next_scheduled_date set not null,
    alter column trigger_schema set not null,
    alter column etag set not null,
    alter column etag set default public.gen_random_uuid();

  revoke select, insert, update, delete on hooks_entities from $db_user_prefix$_hooks;
  drop table hooks_entities;
  grant select, insert, update, delete on hooks to $db_user_prefix$_hooks;
end