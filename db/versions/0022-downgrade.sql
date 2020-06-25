begin
  -- lock this table before reading from it, to prevent loss of concurrent
  -- updates when the table is dropped.
  lock table task_dependencies;

  create table queue_task_dependency_entities(
    partition_key text, row_key text,
    value jsonb not null,
    version integer not null,
    etag uuid default public.gen_random_uuid());
  alter table queue_task_dependency_entities add primary key (partition_key, row_key);

  create table queue_task_requirement_entities(
    partition_key text, row_key text,
    value jsonb not null,
    version integer not null,
    etag uuid default public.gen_random_uuid());
  alter table queue_task_requirement_entities add primary key (partition_key, row_key);

  insert into queue_task_dependency_entities
  select
    required_task_id,
    dependent_task_id,
    jsonb_build_object(
      'PartitionKey', required_task_id,
      'RowKey', dependent_task_id,
      'taskId', slugid_to_uuid(required_task_id),
      'dependentTaskId', slugid_to_uuid(dependent_task_id),
      'require', replace(requires::text, 'all-', ''),
      'expires', expires) as value,
    1 as version,
    task_dependencies.etag as etag
  from task_dependencies;

  insert into queue_task_requirement_entities
  select
    dependent_task_id,
    required_task_id,
    jsonb_build_object(
      'PartitionKey', dependent_task_id,
      'RowKey', required_task_id,
      'taskId', slugid_to_uuid(dependent_task_id),
      'requiredTaskId', slugid_to_uuid(required_task_id),
      'expires', expires) as value,
    1 as version,
    task_dependencies.etag as etag
  from task_dependencies
  where not satisfied;

  revoke select, insert, update, delete on task_dependencies from $db_user_prefix$_queue;
  drop table task_dependencies;

  grant select, insert, update, delete on queue_task_dependency_entities to $db_user_prefix$_queue;
  grant select, insert, update, delete on queue_task_requirement_entities to $db_user_prefix$_queue;
end

