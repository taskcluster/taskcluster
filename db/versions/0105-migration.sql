begin

  CREATE TABLE audit_history (
    entity_id text not null,
    entity_type text not null,
    client_id text not null,
    entity_history jsonb not null
  );

  ALTER TABLE audit_history add primary key (entity_id, entity_type);

end
