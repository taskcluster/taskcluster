begin
  -- convert the postgres string form of a timestamp (which is valid iso8601) into the
  -- precise format returned by JS's Date.toJSON
  create or replace function to_js_iso8601(ts_in text) RETURNS text
  as $$
    begin
      return regexp_replace(ts_in, '(.*) (.*)\+00(:00)?', '\1T\2Z');
    end;
  $$
  language plpgSQL
  strict immutable;

  lock table roles_entities;

  -- Note that roles must be updated as a block, as there are some inter-role
  -- consistency checks that must be followed and are too complex to describe in
  -- SQL, but are expressed in JS in the Auth service.

  raise log 'TIMING start roles create table .. as select';
  create table roles
  as
    select 
      (expanded.role ->> 'roleId') as role_id,
      (expanded.role ->> 'scopes')::jsonb as scopes,
      (expanded.role ->> 'created')::timestamptz as created,
      (expanded.role ->> 'description') as description,
      (expanded.role ->> 'lastModified')::timestamptz as last_modified,
      expanded.etag as etag
    from (
      select
        jsonb_array_elements(
          entity_buf_decode(value, 'blob')::jsonb
        ) as role,
        etag
      from roles_entities
    ) as expanded;

  raise log 'TIMING start roles add primary key';
  alter table roles add primary key (role_id);

  raise log 'TIMING start roles set not null';
  alter table roles
    alter column role_id set not null,
    alter column scopes set not null,
    alter column created set not null,
    alter column description set not null,
    alter column last_modified set not null,
    alter column etag set not null;


  raise log 'TIMING start roles set permissions';
  revoke select, insert, update, delete on roles_entities from $db_user_prefix$_auth;
  drop table roles_entities;

  grant select, insert, update, delete on roles to $db_user_prefix$_auth;
end

