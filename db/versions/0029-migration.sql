begin

  create table github_access_tokens(
    user_id text not null,
    encrypted_access_token jsonb not null);
  alter table github_access_tokens add primary key (user_id);
  grant select, insert, update, delete on github_access_tokens to $db_user_prefix$_web_server;

  revoke select, insert, update, delete on github_access_token_table_entities from $db_user_prefix$_web_server;
  drop table github_access_token_table_entities;

end
