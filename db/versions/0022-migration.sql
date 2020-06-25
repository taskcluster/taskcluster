begin
  -- this migration combines queue_task_dependency_entries (which contains all task
  -- dependencies) and queue_task_requirement_entities (which contains
  -- as-yet-unsatisfied dependencies) into a single table with a `satisfied`
  -- column.  If we consider a dependency to be from "dependent" to "required", then
  -- task_dependency_entities has
  --   partition_key = required_task_id
  --   row_key = dependent_task_id
  -- task_requirement_entities has
  --   partition key = dependent_task_id
  --   row_key = required_task_id
  lock table queue_task_dependency_entities;
  lock table queue_task_requirement_entities;

  create table task_dependencies
  as
    select
      deps.dependent_task_id,
      deps.required_task_id,
      deps.requires,
      reqs.dependent_task_id is null as satisfied,
      deps.expires,
      deps.etag as etag
    from (
      select
        partition_key as required_task_id,
        row_key as dependent_task_id,
        ('all-' || (value ->> 'require'))::task_requires as requires,
        (value ->> 'expires')::timestamptz as expires,
        etag
      from queue_task_dependency_entities
    ) as deps
    left join (
      select
        partition_key as dependent_task_id,
        row_key as required_task_id,
        etag
      from queue_task_requirement_entities
    ) as reqs
    on deps.dependent_task_id = reqs.dependent_task_id and
      deps.required_task_id = reqs.required_task_id;

  alter table task_dependencies
    alter column dependent_task_id set not null,
    alter column required_task_id set not null,
    alter column requires set not null,
    alter column satisfied set not null,
    alter column expires set not null,
    alter column etag set not null,
    alter column etag set default public.gen_random_uuid();

  -- the task itself contains an array of dependent tasks, so querying by
  -- dependent_task_id is unusual, so primary key begins with required_task_id.
  alter table task_dependencies add primary key (required_task_id, dependent_task_id);

  -- queue's isBlocked indexes by dependent_task_id, looking only for unsatisfied
  -- entries.  This index then takes the place of the queue_task_requirement_entities
  -- table and that these queries can be handled by accessing only the index.
  create index task_dependencies_dependent_task_id_idx on task_dependencies (dependent_task_id)
    where not satisfied;

  revoke select, insert, update, delete on queue_task_dependency_entities from $db_user_prefix$_queue;
  drop table queue_task_dependency_entities;
  revoke select, insert, update, delete on queue_task_requirement_entities from $db_user_prefix$_queue;
  drop table queue_task_requirement_entities;

  grant select, insert, update, delete on task_dependencies to $db_user_prefix$_queue;
end
