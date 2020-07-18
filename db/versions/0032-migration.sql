begin
  -- Compute the sha512 of the given text data.
  -- sha512 is the algorithm that will be used to generate the hash.
  -- This replaces Entity.keys.HashKey from taskcluster-lib-entities.
  create or replace function sha512(t text) returns text
  as $$
      begin
        -- note that because this function is called in a restricted context during
        -- index analysis, it must explicitly reference the schema for the digest
        -- function; see 
        -- https://www.postgresql.org/message-id/8572.1531922146%40sss.pgh.pa.us
        return encode(public.digest(t, 'sha512'), 'hex');
      end;
  $$
  language plpgSQL
  strict immutable;
end
