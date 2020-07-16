begin
  -- lock this table before reading from it, to prevent loss of concurrent
  -- updates when the table is dropped.  Note that this may lead to concurrent
  -- updates failing; the important thing is that they not succeed without
  -- taking effect.  Failed updates will be retried.
  lock table queue_worker_entities;

  create table queue_workers
  as
    select
      (value ->> 'provisionerId')::text as provisioner_id,
      (value ->> 'workerType')::text as worker_type,
      (value ->> 'workerGroup')::text as worker_group,
      (value ->> 'workerId')::text as worker_id,
      entity_buf_decode(value, 'recentTasks')::jsonb as recent_tasks,
      (value ->> 'quarantineUntil')::timestamptz as quarantine_until,
      (value ->> 'expires')::timestamptz as expires,
      (value ->> 'firstClaim')::timestamptz as first_claim,
      etag
    from queue_worker_entities;
  alter table queue_workers add primary key (provisioner_id, worker_id);
  alter table queue_workers
    alter column provisioner_id set not null,
    alter column worker_type set not null,
    alter column worker_group set not null,
    alter column worker_id set not null,
    alter column recent_tasks set not null,
    alter column quarantine_until set not null,
    alter column expires set not null,
    alter column first_claim set not null,
    alter column etag set not null,
    alter column etag set default public.gen_random_uuid();

  revoke select, insert, update, delete on queue_worker_entities from $db_user_prefix$_queue;
  drop table queue_worker_entities;
  grant select, insert, update, delete on queue_workers to $db_user_prefix$_queue;
end
