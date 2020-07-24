begin

  -- lock this table before reading from it, to prevent loss of concurrent
  -- updates when the table is dropped.  Note that this may lead to concurrent
  -- updates failing; the important thing is that they not succeed without
  -- taking effect.  Failed updates will be retried.
  lock table taskcluster_integration_owners_entities;

  create table github_integrations
  as
    select
      (value ->> 'owner')::text as owner,
      (value ->> 'installationId')::integer as installation_id
    from taskcluster_integration_owners_entities;
  alter table github_integrations add primary key (owner);
  alter table github_integrations
    alter column owner set not null,
    alter column installation_id set not null;

  revoke select, insert, update, delete on taskcluster_integration_owners_entities from $db_user_prefix$_github;
  drop table taskcluster_integration_owners_entities;
  grant select, insert, update, delete on github_integrations to $db_user_prefix$_github;
end