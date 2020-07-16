begin
  -- lock this table before reading from it, to prevent loss of concurrent
  -- updates when the table is dropped.  Note that this may lead to concurrent
  -- updates failing; the important thing is that they not succeed without
  -- taking effect.  Failed updates will be retried.
  lock table queue_provisioner_entities;

  create table queue_provisioners
  as
    select
      (value ->> 'provisionerId')::text as provisioner_id,
      (value ->> 'expires')::timestamptz as expires,
      (value ->> 'lastDateActive')::timestamptz as last_date_active,
      entity_buf_decode(value, 'description')::text as description,
      (value ->> 'stability')::text as stability,
      entity_buf_decode(value, 'actions')::jsonb as actions,
      etag
    from queue_provisioner_entities;
  alter table queue_provisioners add primary key (provisioner_id);
  alter table queue_provisioners
    alter column provisioner_id set not null,
    alter column expires set not null,
    alter column last_date_active set not null,
    alter column description set not null,
    alter column stability set not null,
    alter column actions set not null,
    alter column etag set not null,
    alter column etag set default public.gen_random_uuid();

  revoke select, insert, update, delete on queue_provisioner_entities from $db_user_prefix$_queue;
  drop table queue_provisioner_entities;
  grant select, insert, update, delete on queue_provisioners to $db_user_prefix$_queue;
end
