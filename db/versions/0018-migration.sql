begin
  -- lock this table before reading from it, to prevent loss of concurrent
  -- updates when the table is dropped.  Note that this may lead to concurrent
  -- updates failing; the important thing is that they not succeed without
  -- taking effect.  Failed updates will be retried.
  lock table indexed_tasks_entities;

  create table indexed_tasks
  as
    select
      (value ->> 'namespace')::text as namespace,
      (value ->> 'name')::text as name,
      (value ->> 'rank')::integer as rank,
      (value ->> 'taskId')::text as task_id,
      entity_buf_decode(value, 'data')::jsonb as data,
      (value ->> 'expires')::timestamptz as expires,
      etag
    from indexed_tasks_entities;
  alter table indexed_tasks add primary key (namespace, name);
  alter table indexed_tasks
    alter column namespace set not null,
    alter column name set not null,
    alter column rank set not null,
    alter column task_id set not null,
    alter column expires set not null,
    alter column data set not null,
    alter column etag set not null,
    alter column etag set default public.gen_random_uuid();

  revoke select, insert, update, delete on indexed_tasks_entities from $db_user_prefix$_index;
  drop table indexed_tasks_entities;
  grant select, insert, update, delete on indexed_tasks to $db_user_prefix$_index;


  -- lock this table before reading from it, to prevent loss of concurrent
  -- updates when the table is dropped.  Note that this may lead to concurrent
  -- updates failing; the important thing is that they not succeed without
  -- taking effect.  Failed updates will be retried.
  lock table namespaces_entities;

  create table namespaces
  as
    select
      (value ->> 'parent')::text as parent,
      (value ->> 'name')::text as name,
      (value ->> 'expires')::timestamptz as expires,
      etag
    from namespaces_entities;
  alter table namespaces add primary key (parent, name);
  alter table namespaces
    alter column parent set not null,
    alter column name set not null,
    alter column expires set not null,
    alter column etag set not null,
    alter column etag set default public.gen_random_uuid();

  revoke select, insert, update, delete on namespaces_entities from $db_user_prefix$_index;
  drop table namespaces_entities;
  grant select, insert, update, delete on namespaces to $db_user_prefix$_index;
end
