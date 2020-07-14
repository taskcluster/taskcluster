begin
  -- lock this table before reading from it, to prevent loss of concurrent
  -- updates when the table is dropped.
  lock table github_builds;

  create table taskcluster_github_builds_entities(
    partition_key text, row_key text,
    value jsonb not null,
    version integer not null,
    etag uuid default public.gen_random_uuid());
  alter table taskcluster_github_builds_entities add primary key (partition_key, row_key);

  insert into taskcluster_github_builds_entities
  select
    encode_string_key(task_group_id) as partition_key,
    'taskGroupId' as row_key,
    jsonb_build_object(
      'PartitionKey', encode_string_key(task_group_id),
      'RowKey', 'taskGroupId',
      'organization', organization,
      'repository', repository,
      'sha', sha,
      'taskGroupId', task_group_id,
      'state', state,
      'created', created,
      'updated', updated,
      'installationId', installation_id,
      'eventType', event_type,
      'eventId', event_id) as value,
    1 as version,
    etag
  from github_builds;

  revoke select, insert, update, delete on github_builds from $db_user_prefix$_github;
  drop table github_builds;
  grant select, insert, update, delete on taskcluster_github_builds_entities to $db_user_prefix$_github;
end