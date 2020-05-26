begin
  -- lock this table before reading from it, to prevent loss of concurrent
  -- updates when the table is dropped.  Note that this may lead to concurrent
  -- updates failing; the important thing is that they not succeed without
  -- taking effect.  Failed updates will be retried.
  lock table wmworkers_entities;

  create table workers
  as
    select
      (value ->> 'workerPoolId')::text as worker_pool_id,
      (value ->> 'workerGroup')::text as worker_group,
      (value ->> 'workerId')::text as worker_id,
      (value ->> 'providerId')::text as provider_id,
      (value ->> 'created')::timestamptz as created,
      (value ->> 'expires')::timestamptz as expires,
      (value ->> 'state')::text as state,
      entity_buf_decode(value, 'providerData')::jsonb as provider_data,
      (value ->> 'capacity')::integer as capacity,
      (value ->> 'lastModified')::timestamptz as last_modified,
      (value ->> 'lastChecked')::timestamptz as last_checked,
      etag
    from wmworkers_entities;
  alter table workers add primary key (worker_pool_id, worker_group, worker_id);
  alter table workers
    alter column worker_pool_id set not null,
    alter column worker_group set not null,
    alter column worker_id set not null,
    alter column provider_id set not null,
    alter column created set not null,
    alter column expires set not null,
    alter column state set not null,
    alter column provider_data set not null,
    alter column capacity set not null,
    alter column last_modified set not null,
    alter column last_checked set not null,
    alter column etag set not null,
    alter column etag set default public.gen_random_uuid();

  revoke select, insert, update, delete on wmworkers_entities from $db_user_prefix$_worker_manager;
  drop table wmworkers_entities;
  grant select, insert, update, delete on workers to $db_user_prefix$_worker_manager;
end