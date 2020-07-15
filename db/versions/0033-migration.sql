begin

  -- Given an encrypted field from tc-lib-entities, this function will make the required transformations to the data
  -- structure before storing it in a column.
  create or replace function entity_to_crypto_container_v0(value jsonb, name text) returns jsonb
  as $$
  declare
    chunks integer;
    chunk integer = 0;
    result jsonb = json_build_object('v', 0, 'kid', 'azure');
    begin
      chunks = (value ->> ('__bufchunks_' || name))::integer;
      result = result || jsonb_build_object('__bufchunks_val', chunks);

      loop
        exit when chunks is null or chunk >= chunks;
        result = jsonb_set(result, ('{__buf' || chunk || '_val}')::text[], value -> ('__buf' || chunk || '_' || name));
        chunk = chunk + 1;
      end loop;

      return result;
    end;
  $$
  language plpgSQL
  strict immutable;

  -- Replaces the keys in an encrypted column to be compatible with tc-lib-entities.
  create or replace function encrypted_entity_buf_encode(value jsonb, name text, data jsonb) returns jsonb
  as $$
    declare
      chunks integer;
      chunk integer = 0;
      result jsonb = jsonb_build_object();
      begin
        chunks = (data -> '__bufchunks_val')::integer;
        result = jsonb_build_object('__bufchunks_' || name, chunks);
        value = value || jsonb_build_object('__bufchunks_' || name, chunks);

        loop
          exit when chunks is null or chunk >= chunks;
          value = value || jsonb_build_object('__buf' || chunk || '_' || name, data -> ('__buf' || chunk || '_val'));
          chunk = chunk + 1;
        end loop;


        return value;
      end;
    $$
    language plpgSQL
    strict immutable;

end