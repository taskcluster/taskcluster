begin
  -- lock this table before reading from it, to prevent loss of concurrent
  -- updates when the table is dropped.  Note that this may lead to concurrent
  -- updates failing; the important thing is that they not succeed without
  -- taking effect.  Failed updates will be retried.
  lock table cache_purges_entities;

  create table cache_purges
  as
    select
      (value ->> 'provisionerId')::text as provisioner_id,
      (value ->> 'workerType')::text as worker_type,
      (value ->> 'cacheName')::text as cache_name,
      (value ->> 'before')::timestamptz as before,
      (value ->> 'expires')::timestamptz as expires,
      etag
    from cache_purges_entities;
  alter table cache_purges add primary key (provisioner_id, worker_type, cache_name);
  alter table cache_purges
    alter column provisioner_id set not null,
    alter column worker_type set not null,
    alter column cache_name set not null,
    alter column before set not null,
    alter column expires set not null;

  revoke select, insert, update, delete on cache_purges_entities from $db_user_prefix$_purge_cache;
  drop table cache_purges_entities;
  grant select, insert, update, delete on cache_purges to $db_user_prefix$_purge_cache;
end