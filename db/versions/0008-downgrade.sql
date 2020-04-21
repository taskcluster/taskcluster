begin
  drop function entity_buf_decode(value JSONB, name text);
  drop function entity_buf_encode(value JSONB, name text, data text);
  drop function encode_string_key(in_str text, OUT _result text);
  drop function decode_string_key(in_str text, OUT _result text);
  drop function encode_composite_key(key1 text, key2 text);
  drop function decode_composite_key(encoded_key text);
end
