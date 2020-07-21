begin

  create table access_tokens(
    encrypted_access_token jsonb not null,
    hashed_access_token text not null,
    client_id text not null,
    redirect_uri text not null,
    identity text not null,
    identity_provider_id text not null,
    expires timestamptz not null,
    client_details jsonb not null,
    etag uuid not null default public.gen_random_uuid()
  );
  alter table access_tokens add primary key (hashed_access_token);
  grant select, insert, update, delete on access_tokens to $db_user_prefix$_web_server;

  revoke select, insert, update, delete on access_token_table_entities from $db_user_prefix$_web_server;
  drop table access_token_table_entities;

end
