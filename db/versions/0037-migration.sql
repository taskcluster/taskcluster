begin

  -- lock this table before reading from it, to prevent loss of concurrent
  -- updates when the table is dropped.  Note that this may lead to concurrent
  -- updates failing; the important thing is that they not succeed without
  -- taking effect.  Failed updates will be retried.
  lock table taskcluster_check_runs_entities;
  lock table taskcluster_checks_to_tasks_entities;

  create table github_checks
  as
    select
      (value ->> 'taskGroupId')::text as task_group_id,
      (value ->> 'taskId')::text as task_id,
      (value ->> 'checkSuiteId')::text as check_suite_id,
      (value ->> 'checkRunId')::text as check_run_id
    from taskcluster_check_runs_entities;
  alter table github_checks add primary key (task_group_id, task_id);
  alter table github_checks
    alter column task_group_id set not null,
    alter column task_id set not null,
    alter column check_suite_id set not null,
    alter column check_run_id set not null;

  revoke select, insert, update, delete on taskcluster_check_runs_entities from $db_user_prefix$_github;
  drop table taskcluster_check_runs_entities;
  revoke select, insert, update, delete on taskcluster_checks_to_tasks_entities from $db_user_prefix$_github;
  drop table taskcluster_checks_to_tasks_entities;
  grant select, insert, update, delete on github_checks to $db_user_prefix$_github;
end