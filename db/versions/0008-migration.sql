begin
  -- define useful functions for migrations of tc-lib-entities tables.  These will persist and can
  -- be used by future version files and downgrade scripts

  -- given two simple keys, create a composite key like Entity.CompositeKey.
  create or replace function encode_composite_key(key1 text, key2 text) RETURNS text
  as $$
      begin
          return encode_string_key(key1) || '~' || encode_string_key(key2);
      end;
  $$
  language plpgSQL
  strict immutable;

  -- Reverse the effect of encode_composite_key.  Note that SQL arrays are 1-indexed!
  create or replace function decode_composite_key(encoded_key text) RETURNS text[]
  as $$
      begin
       return array[decode_string_key(split_part(encoded_key, '~', 1)), decode_string_key(split_part(encoded_key, '~', 2))];
      end;
  $$
  language plpgSQL
  strict immutable;

  -- decode the __buf encoding defined in tc-lib-entities entitytypes.js
  create or replace function entity_buf_decode(value JSONB, name text) RETURNS text
  as $$
      declare
          buffer text = '';
          chunks integer;
          chunk integer = 0;
      begin
          chunks = (value ->> ('__bufchunks_' || name))::integer;
          loop
              exit when chunks is null or chunk >= chunks;
              buffer = buffer || (value ->> ('__buf' || chunk || '_' || name))::text;
              chunk = chunk + 1;
          end loop;
          return convert_from(decode(buffer, 'base64'), 'utf8');
      end;
  $$
  language plpgSQL
  strict immutable;

  -- encode the __buf encoding defined in tc-lib-entities entitytypes.js.  This uses a single
  -- buffer unconditionally
  create or replace function entity_buf_encode(value JSONB, name text, data text) RETURNS jsonb
  as $$
      declare
        bytes bytea;
      begin
        value = jsonb_set(value,
            ('{__bufchunks_' || name || '}')::text[],
            to_jsonb(1));
        bytes = convert_to(data, 'utf8');
        value = jsonb_set(value,
            ('{__buf0_' || name || '}')::text[],
            to_jsonb(replace(encode(bytes, 'base64'), E'\n', '')));
        return value;
      end;
  $$
  language plpgSQL
  strict immutable;

  -- SQL implementation of the tc-lib-entities encodeStringKey function, with credit to Nick in
  -- https://stackoverflow.com/questions/341074/urlencode-with-only-built-in-functions
  create or replace function encode_string_key(in_str text) returns text
  as $$
    select
      case when in_str = '' then '!'
      else
        string_agg(
          case
            when ch = E'\x5C' then '!5C'
            when ch = '~' then '!7e'
            when ol>1 or ch !~ '[-''()*.0-9A-Z_a-z]' 
                then regexp_replace(upper(substring(ch::bytea::text, 3)), '(..)', E'!\\1', 'g')
            else ch
          end,
          ''
        )
      end
    from (
      select ch, octet_length(ch) as ol
      from regexp_split_to_table($1, '') as ch
    ) as s;
  $$
  language sql
  strict immutable;

  -- inverse of encode_string_key
  -- based on https://www.postgresql.org/message-id/B6F6FD62F2624C4C9916AC0175D56D880CE1C118@jenmbs01.ad.intershop.net
  -- with some major revisions to handle corner cases
  create or replace function decode_string_key(in_str text) returns text
  as $$
    declare
      ret text;
      t text[];
    begin
      -- '!' is a special-case encoding of an empty string
      if in_str = '!' then
        return '';
      end if;
      
      with str as (
        select
          -- `plain` is an array of all non-encoded substrings, including a blank first string
          -- if necessary so that we can assume the first component is blank
          case when in_str ~ '^![0-9a-fA-F][0-9a-fA-F]' 
            then '{}'|| regexp_split_to_array (in_str,'(![0-9a-fA-F][0-9a-fA-F])+', 'i')
            else regexp_split_to_array (in_str,'(![0-9a-fA-F][0-9a-fA-F])+', 'i')
           end plain,

          -- `encoded` is the opposite, all encoded substrings
          array(select (regexp_matches (in_str,'((?:![0-9a-fA-F][0-9a-fA-F])+)', 'gi'))[1]) encoded
      )
      -- concatentate pairs of `plain` and decoded `encoded`
      select string_agg(plain[i] || coalesce( convert_from(decode(replace(encoded[i], '!',''), 'hex'), 'utf8'),''),'')
          from str, 
                (select  generate_series(1, greatest(0, array_upper(encoded,1))+2) i FROM str) as i
      into ret;
      return ret;
    end;
  $$
  language plpgsql
  strict immutable;
end
