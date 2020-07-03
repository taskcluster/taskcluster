begin
  -- lock this table before reading from it, to prevent loss of concurrent
  -- updates when the table is dropped.
  lock table denylisted_notifications;

  create table denylisted_notification_entities(
    partition_key text, row_key text,
    value jsonb not null,
    version integer not null,
    etag uuid default public.gen_random_uuid());
  alter table denylisted_notification_entities add primary key (partition_key, row_key);

  insert into denylisted_notification_entities
  select
    encode_string_key(notification_type) as partition_key,
    encode_string_key(notification_address) as row_key,
    jsonb_build_object(
      'PartitionKey', encode_string_key(notification_type),
      'RowKey', encode_string_key(notification_address),
      'notificationType', notification_type,
      'notificationAddress', notification_address) as value,
    1 as version,
    etag
  from denylisted_notifications;

  revoke select, insert, update, delete on denylisted_notifications from $db_user_prefix$_notify;
  drop table denylisted_notifications;
  grant select, insert, update, delete on denylisted_notification_entities to $db_user_prefix$_notify;
end
