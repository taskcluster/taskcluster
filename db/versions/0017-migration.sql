begin
  -- lock this table before reading from it, to prevent loss of concurrent
  -- updates when the table is dropped.  Note that this may lead to concurrent
  -- updates failing; the important thing is that they not succeed without
  -- taking effect.  Failed updates will be retried.
  lock table denylisted_notification_entities;

  create table denylisted_notifications
  as
    select
      (value ->> 'notificationType')::text as notification_type,
      (value ->> 'notificationAddress')::text as notification_address,
      etag
    from denylisted_notification_entities;
  alter table denylisted_notifications add primary key (notification_type, notification_address);
  alter table denylisted_notifications
    alter column notification_type set not null,
    alter column notification_address set not null,
    alter column etag set default public.gen_random_uuid();

  revoke select, insert, update, delete on denylisted_notification_entities from $db_user_prefix$_notify;
  drop table denylisted_notification_entities;
  grant select, insert, update, delete on denylisted_notifications to $db_user_prefix$_notify;

end
