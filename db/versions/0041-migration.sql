begin
  -- lock this table before reading from it, to prevent loss of concurrent
  -- updates when the table is dropped.  Note that this may lead to concurrent
  -- updates failing; the important thing is that they not succeed without
  -- taking effect.  Failed updates will be retried.
  lock table clients_entities;

  create table clients
  as
    select
      (value ->> 'clientId')::text as client_id,
      entity_buf_decode(value, 'description')::text as description,
      entity_to_crypto_container_v0(value, 'accessToken') as encrypted_access_token,
      (value ->> 'expires')::timestamptz as expires,
      (value ->> 'disabled')::boolean as disabled,
      entity_buf_decode(value, 'scopes')::jsonb as scopes,
      (details ->> 'created')::timestamptz as created,
      (details ->> 'lastModified')::timestamptz as last_modified,
      (details ->> 'lastDateUsed')::timestamptz as last_date_used,
      (details ->> 'lastRotated')::timestamptz as last_rotated,
      (details ->> 'deleteOnExpiration')::boolean as delete_on_expiration,
      etag
    from (
      select
        value,
        entity_buf_decode(value, 'details')::jsonb as details,
        etag
      from clients_entities
    ) as expanded;
  alter table clients add primary key (client_id);
  alter table clients
    alter column client_id set not null,
    alter column description set not null,
    alter column encrypted_access_token set not null,
    alter column expires set not null,
    alter column disabled set not null,
    alter column scopes set not null,
    alter column created set not null,
    alter column last_modified set not null,
    alter column last_date_used set not null,
    alter column last_rotated set not null,
    alter column delete_on_expiration set not null,
    alter column etag set not null,
    alter column etag set default public.gen_random_uuid();

  revoke select, insert, update, delete on clients_entities from $db_user_prefix$_auth;
  drop table clients_entities;
  grant select, insert, update, delete on clients to $db_user_prefix$_auth;
end
