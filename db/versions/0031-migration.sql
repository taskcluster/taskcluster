begin
  -- lock this table before reading from it, to prevent loss of concurrent
  -- updates when the table is dropped.  Note that this may lead to concurrent
  -- updates failing; the important thing is that they not succeed without
  -- taking effect.  Failed updates will be retried.
  lock table wmworker_pool_errors_entities;

  create table worker_pool_errors
  as
    select
      uuid_to_slugid(value ->> 'errorId')::text as error_id,
      (value ->> 'workerPoolId')::text as worker_pool_id,
      (value ->> 'reported')::timestamptz as reported,
      (value ->> 'kind')::text as kind,
      (value ->> 'title')::text as title,
      (value ->> 'description')::text as description,
      entity_buf_decode(value, 'extra')::jsonb as extra,
      etag
    from wmworker_pool_errors_entities;
  alter table worker_pool_errors add primary key (error_id);
  alter table worker_pool_errors
    alter column error_id set not null,
    alter column worker_pool_id set not null,
    alter column reported set not null,
    alter column kind set not null,
    alter column title set not null,
    alter column description set not null,
    alter column etag set not null,
    alter column etag set default public.gen_random_uuid();

  revoke select, insert, update, delete on wmworker_pool_errors_entities from $db_user_prefix$_worker_manager;
  drop table wmworker_pool_errors_entities;
  grant select, insert, update, delete on worker_pool_errors to $db_user_prefix$_worker_manager;
end
