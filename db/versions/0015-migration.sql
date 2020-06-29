begin
  -- Compute the sha512 of the given text data.
  -- sha512 is the algorithm that will be used to generate the hash.
  -- This replaces Entity.keys.HashKey from taskcluster-lib-entities.
  create or replace function sha512(t text) returns text
  as $$
      begin
        return encode(digest(t, 'sha512'), 'hex');
      end;
  $$
  language plpgSQL
  strict immutable;
end
