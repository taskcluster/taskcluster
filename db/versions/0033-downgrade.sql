begin

  create table session_storage_table_entities(
    partition_key text,
    row_key text,
    value jsonb not null,
    version integer not null,
    etag uuid default public.gen_random_uuid());
  alter table session_storage_table_entities add primary key (partition_key, row_key);
  grant select, insert, update, delete on session_storage_table_entities to $db_user_prefix$_web_server;

  revoke select, insert, update, delete on sessions from $db_user_prefix$_web_server;
  drop table sessions;

end
