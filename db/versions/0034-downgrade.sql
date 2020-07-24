begin
  drop function entity_to_crypto_container_v0(value JSONB, name text);
  drop function encrypted_entity_buf_encode(value JSONB, name text, data jsonb);
end

