begin

  create table authorization_codes(
    code text not null,
    client_id text not null,
    redirect_uri text not null,
    identity text not null,
    identity_provider_id text not null,
    expires timestamptz not null,
    client_details jsonb not null,
    etag uuid not null default public.gen_random_uuid()
  );
  alter table authorization_codes add primary key (code);
  grant select, insert, update, delete on authorization_codes to $db_user_prefix$_web_server;

  revoke select, insert, update, delete on authorization_codes_table_entities from $db_user_prefix$_web_server;
  drop table authorization_codes_table_entities;

end
