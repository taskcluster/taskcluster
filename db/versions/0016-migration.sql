begin
  -- SlugIDs are stored as UUIDs in Azure, because Azure stores that efficiently, but this makes it
  -- difficult to query the DB since everywhere else we deal with SlugIDs in their 22-character
  -- representation.  So these functions convert uuids to slugids and back.  Refer to
  -- https://github.com/taskcluster/slugid/blob/53ec9a2de7140afff5b986c7c60a8028512e87d0/slugid.js
  create or replace function uuid_to_slugid(uuid text) RETURNS text
  as $$
    begin
      return left(replace(replace(encode(decode(replace(uuid, '-', ''), 'hex'), 'base64'), '+', '-'), '/', '_'), 22);
    end;
  $$
  language plpgSQL
  strict immutable;

  create or replace function slugid_to_uuid(slugid text) RETURNS text
  as $$
    begin
      return (encode(decode(replace(replace(slugid, '_', '/'), '-', '+') || '==', 'base64') , 'hex')::uuid)::text;
    end;
  $$
  language plpgSQL
  strict immutable;
end
