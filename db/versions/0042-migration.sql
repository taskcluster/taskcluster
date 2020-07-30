begin
  -- lock this table before reading from it, to prevent loss of concurrent
  -- updates when the table is dropped.  Note that this may lead to concurrent
  -- updates failing; the important thing is that they not succeed without
  -- taking effect.  Failed updates will be retried.
  lock table secrets_entities;

  create table secrets
  as
    select
      (value ->> 'name')::text as name,
      entity_to_crypto_container_v0(value,'secret') as encrypted_secret,
      (value ->> 'expires')::timestamptz as expires
    from secrets_entities;
  alter table secrets add primary key (name);
  alter table secrets
    alter column name set not null,
    alter column encrypted_secret set not null,
    alter column expires set not null;

  revoke select, insert, update, delete on secrets_entities from $db_user_prefix$_secrets;
  drop table secrets_entities;
  grant select, insert, update, delete on secrets to $db_user_prefix$_secrets;
end
