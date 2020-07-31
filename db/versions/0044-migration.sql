begin
  -- lock this table before reading from it, to prevent loss of concurrent
  -- updates when the table is dropped.  Note that this may lead to concurrent
  -- updates failing; the important thing is that they not succeed without
  -- taking effect.  Failed updates will be retried.
  lock table queue_worker_type_entities;

  create table queue_worker_types
  as
    select
      (value ->> 'provisionerId')::text as provisioner_id,
      (value ->> 'workerType')::text as worker_type,
      (value ->> 'expires')::timestamptz as expires,
      (value ->> 'lastDateActive')::timestamptz as last_date_active,
      entity_buf_decode(value, 'description')::text as description,
      (value ->> 'stability')::text as stability,
      etag
    from queue_worker_type_entities;
  alter table queue_worker_types add primary key (provisioner_id, worker_type);
  alter table queue_worker_types
    alter column provisioner_id set not null,
    alter column worker_type set not null,
    alter column expires set not null,
    alter column last_date_active set not null,
    alter column description set not null,
    alter column stability set not null,
    alter column etag set not null,
    alter column etag set default public.gen_random_uuid();

  revoke select, insert, update, delete on queue_worker_type_entities from $db_user_prefix$_queue;
  drop table queue_worker_type_entities;
  grant select, insert, update, delete on queue_worker_types to $db_user_prefix$_queue;
end
