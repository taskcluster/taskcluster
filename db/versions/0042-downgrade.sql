begin
  -- lock this table before reading from it, to prevent loss of concurrent
  -- updates when the table is dropped.
  lock table secrets;

  create table secrets_entities(
    partition_key text, row_key text,
    value jsonb not null,
    version integer not null,
    etag uuid default public.gen_random_uuid());
  alter table secrets_entities add primary key (partition_key, row_key);

  insert into secrets_entities
  select
    encode_string_key('secrets') as partition_key,
    encode_string_key(name) as row_key,
    encrypted_entity_buf_encode(
      jsonb_build_object(
        'PartitionKey', encode_string_key('secrets'),
        'RowKey', encode_string_key(name),
        'expires', secrets.expires,
        'name', secrets.name),
      'secret', secrets.encrypted_secret) as value,
    1 as version,
    public.gen_random_uuid() as etag
  from secrets;

  revoke select, insert, update, delete on secrets from $db_user_prefix$_secrets;
  drop table secrets;
  grant select, insert, update, delete on secrets_entities to $db_user_prefix$_secrets;
end
