begin
  -- lock this table before reading from it, to prevent loss of concurrent
  -- updates when the table is dropped.  Note that this may lead to concurrent
  -- updates failing; the important thing is that they not succeed without
  -- taking effect.  Failed updates will be retried.
  lock table queue_tasks_entities;

  create type task_requires as enum('all-completed', 'all-resolved');
  create type task_priority as enum(
    'highest',
    'very-high',
    'high',
    'medium',
    'low',
    'very-low',
    'lowest',
    'normal'
  );

  -- use a temporary fuction to convert taken_until.  The JS code uses `new
  -- Date(0)` as a null value, so we convert that to NULL here
  create function pg_temp.parse_taken_until(taken_until timestamptz) returns timestamptz
  as $$
      begin
        return case taken_until
          when '1970-01-01 00:00:00+00'::timestamptz then null
          else taken_until
        end;
      end;
  $$
  language plpgSQL
  strict immutable;

  -- left join the tasks entities with the task_group_active_sets entities
  -- which tracks whether a task has ever been resolved or not, and reflect
  -- that into an `ever_resolved` boolean
  create table tasks
  as
    select
      tasks_entities.task_id as task_id,
      (value ->> 'provisionerId')::text as provisioner_id,
      (value ->> 'workerType')::text as worker_type,
      (value ->> 'schedulerId')::text as scheduler_id,
      tasks_entities.task_group_id as task_group_id,
      entity_buf_decode(value, 'dependencies')::jsonb as dependencies,
      (value ->> 'requires')::task_requires as requires,
      entity_buf_decode(value, 'routes')::jsonb as routes,
      (value ->> 'priority')::task_priority as priority,
      (value ->> 'retries')::int as retries,
      (value ->> 'retriesLeft')::int as retries_left,
      (value ->> 'created')::timestamptz as created,
      (value ->> 'deadline')::timestamptz as deadline,
      (value ->> 'expires')::timestamptz as expires,
      entity_buf_decode(value, 'scopes')::jsonb as scopes,
      entity_buf_decode(value, 'payload')::jsonb as payload,
      entity_buf_decode(value, 'metadata')::jsonb as metadata,
      entity_buf_decode(value, 'tags')::jsonb as tags,
      entity_buf_decode(value, 'extra')::jsonb as extra,
      entity_buf_decode(value, 'runs')::jsonb as runs,
      case (value ->> 'takenUntil')::timestamptz
        when '1970-01-01 00:00:00+00'::timestamptz then null
        else (value ->> 'takenUntil')::timestamptz
      end as taken_until,
      (active_tasks.task_id is null)::boolean as ever_resolved,
      etag
    from (
      select
        *,
        partition_key as task_id,
        uuid_to_slugid(value ->> 'taskGroupId')::text as task_group_id
      from queue_tasks_entities
    ) as tasks_entities
    left join (
      select
        partition_key as task_group_id,
        row_key as task_id
      from queue_task_group_active_sets_entities
    ) as active_tasks
    on
      tasks_entities.task_id = active_tasks.task_id and
      tasks_entities.task_group_id = active_tasks.task_group_id;

  alter table tasks add primary key (task_id);
  -- this index servces the purpose of queue_task_group_members_entities
  create index tasks_task_group_id_idx on tasks (task_group_id);
  -- this index servces the purpose of queue_task_group_active_sets_entities
  create index tasks_task_group_id_unresolved_idx on tasks (task_group_id)
    where not ever_resolved;

  alter table tasks
    alter column task_id set not null,
    alter column provisioner_id set not null,
    alter column worker_type set not null,
    alter column scheduler_id set not null,
    alter column task_group_id set not null,
    alter column dependencies set not null,
    alter column requires set not null,
    alter column routes set not null,
    alter column priority set not null,
    alter column retries set not null,
    alter column retries_left set not null,
    alter column created set not null,
    alter column deadline set not null,
    alter column expires set not null,
    alter column scopes set not null,
    alter column payload set not null,
    alter column metadata set not null,
    alter column tags set not null,
    alter column extra set not null,
    alter column runs set not null,
    -- note that taken_until is omitted here as it is intended to be nullable
    alter column ever_resolved set not null,
    alter column etag set not null,
    alter column etag set default public.gen_random_uuid();

  revoke select, insert, update, delete on queue_tasks_entities from $db_user_prefix$_queue;
  drop table queue_tasks_entities;

  -- these tables are replaced by indexes, and no longer needed
  revoke select, insert, update, delete on queue_task_group_members_entities from $db_user_prefix$_queue;
  drop table queue_task_group_members_entities;
  revoke select, insert, update, delete on queue_task_group_active_sets_entities from $db_user_prefix$_queue;
  drop table queue_task_group_active_sets_entities;

  grant select, insert, update, delete on tasks to $db_user_prefix$_queue;
end
