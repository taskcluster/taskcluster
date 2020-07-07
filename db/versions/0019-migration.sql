begin
  -- lock this table before reading from it, to prevent loss of concurrent
  -- updates when the table is dropped.  Note that this may lead to concurrent
  -- updates failing; the important thing is that they not succeed without
  -- taking effect.  Failed updates will be retried.
  lock table queue_artifacts_entities;

  raise log 'TIMING start queue_artifacts create table .. as select';
  create table queue_artifacts
  as
    select
      artifacts_entities.task_id as task_id,
      (value ->> 'runId')::integer as run_id,
      (value ->> 'name')::text as name,
      (value ->> 'storageType')::text as storage_type,
      (value ->> 'contentType')::text as content_type,
      entity_buf_decode(value, 'details')::jsonb as details,
      (value ->> 'present')::boolean as present,
      (value ->> 'expires')::timestamptz as expires,
      etag
    from (
      select
        *,
        uuid_to_slugid(value ->> 'taskId')::text as task_id
      from queue_artifacts_entities
    ) as artifacts_entities;
  raise log 'TIMING start queue_artifacts add primary key';
  alter table queue_artifacts add primary key (task_id, run_id, name);
  raise log 'TIMING start queue_artifacts set not null';
  alter table queue_artifacts
    alter column task_id set not null,
    alter column run_id set not null,
    alter column name set not null,
    alter column storage_type set not null,
    alter column content_type set not null,
    alter column details set not null,
    alter column present set not null,
    alter column expires set not null,
    alter column etag set not null,
    alter column etag set default public.gen_random_uuid();

  raise log 'TIMING start queue_artifacts permissions';
  revoke select, insert, update, delete on queue_artifacts_entities from $db_user_prefix$_queue;
  drop table queue_artifacts_entities;
  grant select, insert, update, delete on queue_artifacts to $db_user_prefix$_queue;
end
