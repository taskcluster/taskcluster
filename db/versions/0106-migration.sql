begin

  CREATE TABLE audit_history (
    entity_id text not null,
    entity_type text not null,
    client_id text not null,
    action_type text not null,
    created timestamptz not null
  );

  ALTER TABLE audit_history add primary key (entity_id, entity_type, created);

  GRANT select, insert, update, delete ON audit_history to $db_user_prefix$_auth;
  GRANT select, insert, update, delete on audit_history to $db_user_prefix$_hooks;
  GRANT select, insert, update, delete on audit_history to $db_user_prefix$_secrets;
  GRANT select, insert, update, delete on audit_history to $db_user_prefix$_worker_manager;

end
