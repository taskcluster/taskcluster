begin
  -- lock this table before reading from it, to prevent loss of concurrent
  -- updates when the table is dropped.
  lock table tasks;

  create table queue_tasks_entities(
    partition_key text, row_key text,
    value jsonb not null,
    version integer not null,
    etag uuid default public.gen_random_uuid());
  alter table queue_tasks_entities add primary key (partition_key, row_key);

  create table queue_task_group_members_entities(
    partition_key text, row_key text,
    value jsonb not null,
    version integer not null,
    etag uuid default public.gen_random_uuid());
  alter table queue_task_group_members_entities add primary key (partition_key, row_key);

  create table queue_task_group_active_sets_entities(
    partition_key text, row_key text,
    value jsonb not null,
    version integer not null,
    etag uuid default public.gen_random_uuid());
  alter table queue_task_group_active_sets_entities add primary key (partition_key, row_key);

  insert into queue_tasks_entities
  select
    -- note, the partition_key is the slugid form, not uuid, and contains no
    -- characters that must be escaped in an Azure key
    task_id as partition_key,
    'task' as row_key,
    entity_buf_encode(
      entity_buf_encode(
        entity_buf_encode(
          entity_buf_encode(
            entity_buf_encode(
              entity_buf_encode(
                entity_buf_encode(
                  entity_buf_encode(
                    jsonb_build_object(
                      'PartitionKey', task_id,
                      'RowKey', 'task',
                      'taskId', slugid_to_uuid(task_id),
                      'provisionerId', provisioner_id,
                      'workerType', worker_type,
                      'schedulerId', scheduler_id,
                      'taskGroupId', slugid_to_uuid(task_group_id),
                      'requires', requires::text,
                      'priority', priority::text,
                      'retries', retries,
                      'retriesLeft', retries_left,
                      'created', created,
                      'deadline', deadline,
                      'expires', expires,
                      'takenUntil', coalesce(taken_until, '1970-01-01 00:00:00+00'::timestamptz)),
                    'dependencies', dependencies::text),
                  'routes', routes::text),
                'scopes', scopes::text),
              'payload', payload::text),
            'metadata', metadata::text),
          'tags', tags::text),
        'extra', extra::text),
      'runs', runs::text) as value,
    1 as version,
    etag
  from tasks;

  -- queue_task_group_members_entities is just a different index on the tasks
  -- table, so we reconstruct it from the tasks
  insert into queue_task_group_members_entities
  select
    task_group_id as partition_key,
    task_id as row_key,
    jsonb_build_object(
      'PartitionKey', task_group_id,
      'RowKey', task_id,
      'taskId', slugid_to_uuid(task_id),
      'taskGroupId', slugid_to_uuid(task_group_id)) as value,
    1 as version,
    etag
  from tasks;

  -- similarly for queue_task_group_active_sets_entities
  insert into queue_task_group_active_sets_entities
  select
    task_group_id as partition_key,
    task_id as row_key,
    jsonb_build_object(
      'PartitionKey', task_group_id,
      'RowKey', task_id,
      'taskId', slugid_to_uuid(task_id),
      'taskGroupId', slugid_to_uuid(task_group_id)) as value,
    1 as version,
    etag
  from tasks
  where not ever_resolved;

  revoke select, insert, update, delete on tasks from $db_user_prefix$_queue;
  drop table tasks;

  grant select, insert, update, delete on queue_tasks_entities to $db_user_prefix$_queue;
  grant select, insert, update, delete on queue_task_group_members_entities to $db_user_prefix$_queue;
  grant select, insert, update, delete on queue_task_group_active_sets_entities to $db_user_prefix$_queue;

  drop type task_requires;
  drop type task_priority;
end
