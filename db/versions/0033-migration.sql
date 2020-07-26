begin
  -- lock this table before reading from it, to prevent loss of concurrent
  -- updates when the table is dropped.  Note that this may lead to concurrent
  -- updates failing; the important thing is that they not succeed without
  -- taking effect.  Failed updates will be retried.
  lock table queues_entities;

  create table hooks_queues
  as
    select
      (value ->> 'hookGroupId')::text as hook_group_id,
      (value ->> 'hookId')::text as hook_id,
      (value ->> 'queueName')::text as queue_name,
      entity_buf_decode(value, 'bindings')::jsonb as bindings,
      etag
    from queues_entities;
  alter table hooks_queues add primary key (hook_group_id, hook_id);
  alter table hooks_queues
    alter column hook_group_id set not null,
    alter column hook_id set not null,
    alter column queue_name set not null,
    alter column bindings set not null,
    alter column etag set not null,
    alter column etag set default public.gen_random_uuid();

  revoke select, insert, update, delete on queues_entities from $db_user_prefix$_hooks;
  drop table queues_entities;
  grant select, insert, update, delete on hooks_queues to $db_user_prefix$_hooks;
end
