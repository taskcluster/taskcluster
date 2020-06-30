begin
  -- lock this table before reading from it, to prevent loss of concurrent
  -- updates when the table is dropped.
  lock table github_checks;

  create table taskcluster_check_runs_entities(
    partition_key text, row_key text,
    value jsonb not null,
    version integer not null,
    etag uuid default public.gen_random_uuid());
  alter table taskcluster_check_runs_entities add primary key (partition_key, row_key);
  create table taskcluster_checks_to_tasks_entities(
    partition_key text, row_key text,
    value jsonb not null,
    version integer not null,
    etag uuid default public.gen_random_uuid());
  alter table taskcluster_checks_to_tasks_entities add primary key (partition_key, row_key);

  insert into taskcluster_check_runs_entities
  select
    encode_string_key(task_group_id) as partition_key,
    encode_string_key(task_id) as row_key,
    jsonb_build_object(
      'PartitionKey', encode_string_key(task_group_id),
      'RowKey', encode_string_key(task_id),
      'taskGroupId', task_group_id,
      'taskId', task_id,
      'checkSuiteId', check_suite_id,
      'checkRunId', check_run_id) as value,
    1 as version,
    public.gen_random_uuid() as etag
  from github_checks;

  insert into taskcluster_checks_to_tasks_entities
  select
    encode_string_key(check_suite_id) as partition_key,
    encode_string_key(check_run_id) as row_key,
    jsonb_build_object(
      'PartitionKey', encode_string_key(check_suite_id),
      'RowKey', encode_string_key(check_run_id),
      'taskGroupId', task_group_id,
      'taskId', task_id,
      'checkSuiteId', check_suite_id,
      'checkRunId', check_run_id) as value,
    1 as version,
    public.gen_random_uuid() as etag
  from github_checks;

  revoke select, insert, update, delete on github_checks from $db_user_prefix$_github;
  drop table github_checks;
  grant select, insert, update, delete on taskcluster_check_runs_entities to $db_user_prefix$_github;
  grant select, insert, update, delete on taskcluster_checks_to_tasks_entities to $db_user_prefix$_github;
end