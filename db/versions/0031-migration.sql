begin

  create table sessions(
    encrypted_session_id jsonb not null,
    data jsonb not null,
    expires timestamptz not null
  );
  alter table sessions add primary key (encrypted_session_id);
  grant select, insert, update, delete on sessions to $db_user_prefix$_web_server;

  revoke select, insert, update, delete on session_storage_table_entities from $db_user_prefix$_web_server;
  drop table session_storage_table_entities;

end
