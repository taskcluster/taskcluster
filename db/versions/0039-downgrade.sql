begin

  create table authorization_codes_table_entities(
    partition_key text,
    row_key text,
    value jsonb not null,
    version integer not null,
    etag uuid default public.gen_random_uuid());
  alter table authorization_codes_table_entities add primary key (partition_key, row_key);
  grant select, insert, update, delete on authorization_codes_table_entities to $db_user_prefix$_web_server;

  revoke select, insert, update, delete on authorization_codes from $db_user_prefix$_web_server;
  drop table authorization_codes;

end
