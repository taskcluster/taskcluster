begin
  lock table roles;

  raise log 'TIMING start roles_entities create table';
  create table roles_entities(
    partition_key text, row_key text,
    value jsonb not null,
    version integer not null,
    etag uuid default public.gen_random_uuid());

  raise log 'TIMING start roles_entities primary key';
  alter table roles_entities add primary key (partition_key, row_key);

  raise log 'TIMING start roles_entities insert';
  perform 1 from roles;
  if found then
    insert into roles_entities
    select
      'role' as partition_key,
      'role' as row_key,
      entity_buf_encode(
        jsonb_build_object(
          'PartitionKey', 'roles',
          'RowKey', 'roles'),
        'blob', jsonb_agg(
          jsonb_build_object(
            'roleId', role_id,
            'scopes', scopes,
            'created', to_js_iso8601(created::text),
            'description', description,
            'lastModified', to_js_iso8601(last_modified::text))
        )::text) as value,
      1 as version,
      -- use an aggregate function to select the etag (all rows have the same etag)
      min(etag::text)::uuid as etag
    from roles;
  end if;

  raise log 'TIMING start roles_entities permissions';
  revoke select, insert, update, delete on roles from $db_user_prefix$_auth;
  drop table roles;

  grant select, insert, update, delete on roles_entities to $db_user_prefix$_auth;

  drop function to_js_iso8601(ts_in text);
end

