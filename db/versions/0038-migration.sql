begin

  create table sessions(
    hashed_session_id text not null,
    encrypted_session_id jsonb not null,
    data jsonb not null,
    expires timestamptz not null,
    etag uuid not null default public.gen_random_uuid()
  );
  alter table sessions add primary key (hashed_session_id);
  grant select, insert, update, delete on sessions to $db_user_prefix$_web_server;

  revoke select, insert, update, delete on session_storage_table_entities from $db_user_prefix$_web_server;
  drop table session_storage_table_entities;

end
