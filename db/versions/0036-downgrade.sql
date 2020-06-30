begin
  -- lock this table before reading from it, to prevent loss of concurrent
  -- updates when the table is dropped.
  lock table github_integrations;

  create table taskcluster_integration_owners_entities(
    partition_key text, row_key text,
    value jsonb not null,
    version integer not null,
    etag uuid default public.gen_random_uuid());
  alter table taskcluster_integration_owners_entities add primary key (partition_key, row_key);

  insert into taskcluster_integration_owners_entities
  select
    encode_string_key(owner) as partition_key,
    'someConstant' as row_key,
    jsonb_build_object(
      'PartitionKey', encode_string_key(owner),
      'RowKey', 'someConstant',
      'owner', owner,
      'installationId', installation_id) as value,
    1 as version,
    public.gen_random_uuid() as etag
  from github_integrations;

  revoke select, insert, update, delete on github_integrations from $db_user_prefix$_github;
  drop table github_integrations;
  grant select, insert, update, delete on taskcluster_integration_owners_entities to $db_user_prefix$_github;
end