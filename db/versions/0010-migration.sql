begin
  -- decode the __buf encoding defined in tc-lib-entities entitytypes.js.
  -- This is a re-definition of the function from DB version 8, where it incorrectly
  -- handled rows with more than one buffer.
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
              buffer = buffer || convert_from(decode((value ->> ('__buf' || chunk || '_' || name))::text, 'base64'), 'utf8');
              chunk = chunk + 1;
          end loop;
          return buffer;
      end;
  $$
  language plpgSQL
  strict immutable;

  -- lock this table before reading from it, to prevent loss of concurrent
  -- updates when the table is dropped.  Note that this may lead to concurrent
  -- updates failing; the important thing is that they not succeed without
  -- taking effect.  Failed updates will be retried.
  lock table wmworker_pools_entities;

  create table worker_pools
  as
    select
      (value ->> 'workerPoolId')::text as worker_pool_id,
      (value ->> 'providerId')::text as provider_id,
      (value ->> 'owner')::text as owner,
      (value ->> 'description')::text as description,
      (value -> 'emailOnError')::boolean as email_on_error,
      (value ->> 'created')::timestamptz as created,
      (value ->> 'lastModified')::timestamptz as last_modified,
      entity_buf_decode(value, 'config')::jsonb as config,
      entity_buf_decode(value, 'providerData')::jsonb as provider_data,
      entity_buf_decode(value, 'previousProviderIds')::jsonb as previous_provider_ids,
      etag
    from wmworker_pools_entities;
  alter table worker_pools add primary key (worker_pool_id);
  alter table worker_pools
    alter column provider_id set not null,
    alter column owner set not null,
    alter column description set not null,
    alter column email_on_error set not null,
    alter column created set not null,
    alter column last_modified set not null,
    alter column config set not null,
    alter column provider_data set not null,
    alter column previous_provider_ids set not null,
    alter column etag set not null,
    alter column etag set default public.gen_random_uuid();

  revoke select, insert, update, delete on wmworker_pools_entities from $db_user_prefix$_worker_manager;
  drop table wmworker_pools_entities;
  grant select, insert, update, delete on worker_pools to $db_user_prefix$_worker_manager;
end
