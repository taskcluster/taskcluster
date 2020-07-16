begin
  -- lock this table before reading from it, to prevent loss of concurrent
  -- updates when the table is dropped.
  lock table clients;

  create table clients_entities(
    partition_key text, row_key text,
    value jsonb not null,
    version integer not null,
    etag uuid default public.gen_random_uuid());
  alter table clients_entities add primary key (partition_key, row_key);

  insert into clients_entities
  select
    encode_string_key(client_id) as partition_key,
    'client' as row_key,
    entity_buf_encode(
      encrypted_entity_buf_encode(
        entity_buf_encode(
          entity_buf_encode(
            jsonb_build_object(
              'PartitionKey', encode_string_key(client_id),
              'RowKey', 'client',
              'clientId', client_id,
              'disabled', disabled::int,
              'expires', expires),
            'description', description),
          'scopes', scopes::text),
        'accessToken', encrypted_access_token),
      'details', jsonb_build_object(
        'created', created,
        'lastModified', last_modified,
        'lastDateUsed', last_date_used,
        'lastRotated', last_rotated,
        'deleteOnExpiration', delete_on_expiration
      )::text) as value,
    1 as version,
    etag
  from clients;

  revoke select, insert, update, delete on clients from $db_user_prefix$_hooks;
  drop table clients;
  grant select, insert, update, delete on clients_entities to $db_user_prefix$_hooks;
end

