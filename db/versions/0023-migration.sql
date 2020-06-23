begin

  -- lock this table before reading from it, to prevent loss of concurrent
  -- updates when the table is dropped.  Note that this may lead to concurrent
  -- updates failing; the important thing is that they not succeed without
  -- taking effect.  Failed updates will be retried.
  lock table taskcluster_github_builds_entities;

  create table github_builds
  as
    select
      (value ->> 'organization')::text as organization,
      (value ->> 'repository')::text as repository,
      (value ->> 'sha')::text as sha,
      (value ->> 'taskGroupId')::text as task_group_id,
      (value ->> 'state')::text as state,
      (value ->> 'created')::timestamptz as created,
      (value ->> 'updated')::timestamptz as updated,
      (value ->> 'installationId')::integer as installation_id,
      (value ->> 'eventType')::text as event_type,
      (value ->> 'eventId')::text as event_id,
      etag
    from taskcluster_github_builds_entities;
  alter table github_builds add primary key (task_group_id);
  alter table github_builds
    alter column organization set not null,
    alter column repository set not null,
    alter column sha set not null,
    alter column task_group_id set not null,
    alter column state set not null,
    alter column created set not null,
    alter column updated set not null,
    alter column installation_id set not null,
    alter column event_type set not null,
    alter column event_id set not null,
    alter column etag set not null,
    alter column etag set default public.gen_random_uuid();

  revoke select, insert, update, delete on taskcluster_github_builds_entities from $db_user_prefix$_github;
  drop table taskcluster_github_builds_entities;
  grant select, insert, update, delete on github_builds to $db_user_prefix$_github;
end