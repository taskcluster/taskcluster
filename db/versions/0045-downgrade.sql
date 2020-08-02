begin
  -- lock this table before reading from it, to prevent loss of concurrent
  -- updates when the table is dropped.
  lock table queue_provisioners;

  create table queue_provisioner_entities(
    partition_key text, row_key text,
    value jsonb not null,
    version integer not null,
    etag uuid default public.gen_random_uuid());
  alter table queue_provisioner_entities add primary key (partition_key, row_key);

  insert into queue_provisioner_entities
  select
    encode_string_key(provisioner_id) as partition_key,
    'provisioner' as row_key,
    entity_buf_encode(
      entity_buf_encode(
        jsonb_build_object(
          'PartitionKey', encode_string_key(provisioner_id),
          'RowKey', 'provisioner',
          'provisionerId', provisioner_id,
          'expires', expires,
          'lastDateActive', last_date_active,
          'stability', stability),
        'description', description::text),
      'actions', actions::text) as value,
    1 as version,
    etag
  from queue_provisioners;

  revoke select, insert, update, delete on queue_provisioners from $db_user_prefix$_queue;
  drop table queue_provisioners;
  grant select, insert, update, delete on queue_provisioner_entities to $db_user_prefix$_queue;
end
