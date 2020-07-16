begin
  -- lock this table before reading from it, to prevent loss of concurrent
  -- updates when the table is dropped.
  lock table hooks;

  create table hooks_entities(
    partition_key text, row_key text,
    value jsonb not null,
    version integer not null,
    etag uuid default public.gen_random_uuid());
  alter table hooks_entities add primary key (partition_key, row_key);

  insert into hooks_entities
  select
    encode_string_key(hook_group_id) as partition_key,
    encode_string_key(hook_id) as row_key,
    encrypted_entity_buf_encode(
      encrypted_entity_buf_encode(
        entity_buf_encode(
          entity_buf_encode(
            entity_buf_encode(
              entity_buf_encode(
                entity_buf_encode(
                  jsonb_build_object(
                    'PartitionKey', encode_string_key(hook_group_id),
                    'RowKey', encode_string_key(hook_id),
                    'hookGroupId', hook_group_id,
                    'hookId', hook_id,
                    'nextScheduledDate', next_scheduled_date),
                  'metadata', metadata::text),
                'task', task::text),
              'bindings', bindings::text),
            'schedule', schedule::text),
          'triggerSchema', trigger_schema::text),
        'nextTaskId', encrypted_next_task_id),
      'triggerToken', encrypted_trigger_token) as value,
    1 as version,
    etag
  from hooks;

  revoke select, insert, update, delete on hooks from $db_user_prefix$_hooks;
  drop table hooks;
  grant select, insert, update, delete on hooks_entities to $db_user_prefix$_hooks;
end

