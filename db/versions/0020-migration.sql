begin
  create type task_requires as enum('all-completed', 'all-resolved');
  create type task_priority as enum(
    'highest',
    'very-high',
    'high',
    'medium',
    'low',
    'very-low',
    'lowest',
    'normal'
  );

  raise log 'TIMING start tasks create tasks table';

  create table tasks (
    task_id text not null,
    provisioner_id text not null,
    worker_type text not null,
    scheduler_id text not null,
    task_group_id text not null,
    dependencies jsonb not null,
    requires task_requires not null,
    routes jsonb not null,
    priority task_priority not null,
    retries int not null,
    retries_left int not null,
    created timestamptz not null,
    deadline timestamptz not null,
    expires timestamptz not null,
    scopes jsonb not null,
    payload jsonb not null,
    metadata jsonb not null,
    tags jsonb not null,
    extra jsonb not null,
    runs jsonb not null,
    taken_until timestamptz,
    ever_resolved boolean not null,
    etag uuid not null
  );

  alter table tasks add primary key (task_id);
  -- this index servces the purpose of queue_task_group_members_entities
  create index tasks_task_group_id_idx on tasks (task_group_id);
  -- this index servces the purpose of queue_task_group_active_sets_entities
  create index tasks_task_group_id_unresolved_idx on tasks (task_group_id)
    where not ever_resolved;

  grant select, insert, update, delete on tasks to $db_user_prefix$_queue;

  -- define a function to march the migration forward (in a transaction) and
  -- another to indicate the migration is complete.

  create or replace function v20_migration_migrate_tasks(task_ids_after text, count int) returns setof text as $x$
  declare
    entity record;
  begin
    -- loop over immutable tasks (those with deadline < now) using the requested pagination
    for entity in
      select *
      from queue_tasks_entities
      where
        (task_ids_after is null or queue_tasks_entities.partition_key > task_ids_after) and
        (queue_tasks_entities.value ->> 'deadline')::timestamptz < NOW()
      order by queue_tasks_entities.partition_key
      limit count
    loop
      raise log 'migrating task % to tasks table', entity.partition_key;

      -- if this row is not expired, migrate it (otherwise it will just be deleted)
      if (entity.value ->> 'expires')::timestamptz >= now() then
        insert into tasks
        select
          queue_tasks_entities.partition_key as task_id,
          (value ->> 'provisionerId')::text as provisioner_id,
          (value ->> 'workerType')::text as worker_type,
          (value ->> 'schedulerId')::text as scheduler_id,
          uuid_to_slugid(value ->> 'taskGroupId')::text as task_group_id,
          entity_buf_decode(value, 'dependencies')::jsonb as dependencies,
          (value ->> 'requires')::task_requires as requires,
          entity_buf_decode(value, 'routes')::jsonb as routes,
          (value ->> 'priority')::task_priority as priority,
          (value ->> 'retries')::int as retries,
          (value ->> 'retriesLeft')::int as retries_left,
          (value ->> 'created')::timestamptz as created,
          (value ->> 'deadline')::timestamptz as deadline,
          (value ->> 'expires')::timestamptz as expires,
          entity_buf_decode(value, 'scopes')::jsonb as scopes,
          entity_buf_decode(value, 'payload')::jsonb as payload,
          entity_buf_decode(value, 'metadata')::jsonb as metadata,
          entity_buf_decode(value, 'tags')::jsonb as tags,
          entity_buf_decode(value, 'extra')::jsonb as extra,
          entity_buf_decode(value, 'runs')::jsonb as runs,
          case (value ->> 'takenUntil')::timestamptz
            when '1970-01-01 00:00:00+00'::timestamptz then null
            else (value ->> 'takenUntil')::timestamptz
          end as taken_until,
          true as ever_resolved, -- a past-deadline task is resolved
          etag
        from queue_tasks_entities
        where queue_tasks_entities.partition_key = entity.partition_key;
      end if;

      -- in any case, delete the row from the entities tables
      delete from queue_tasks_entities where partition_key = entity.partition_key;
      delete from queue_task_group_members_entities
      where
        partition_key = uuid_to_slugid(entity.value ->> 'taskGroupId')::text and
        row_key = entity.partition_key; -- task_id
      delete from queue_task_group_active_sets_entities
      where
        partition_key = uuid_to_slugid(entity.value ->> 'taskGroupId')::text and
        row_key = entity.partition_key; -- task_id

      return next entity.partition_key;
    end loop;
  end
  $x$ language plpgsql;

  create or replace function v20_migration_is_complete() returns boolean as $x$
  begin
    perform * from queue_tasks_entities limit 1;
    return not found;
  end
  $x$ language plpgsql;

  -- finish the migration by replacing all of the functions with those from the
  -- original 0020 version
  create or replace function v20_migration_finish() returns void as $x$
  begin
    perform * from queue_tasks_entities limit 1;
    if found then
      raise exception 'queue_tasks_entities still contains rows.. keep migrating'
      using errcode = 'P0001';
    end if;

    -- define all of the functions as verbatim from the original 0020.yml
    create or replace function
    queue_tasks_entities_load(partition_key text, row_key text)
    returns table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid)
    as $$
      begin
        return query
        select
          queue_tasks_entities_load.partition_key,
          queue_tasks_entities_load.row_key,
          entity_buf_encode(
            entity_buf_encode(
              entity_buf_encode(
                entity_buf_encode(
                  entity_buf_encode(
                    entity_buf_encode(
                      entity_buf_encode(
                        entity_buf_encode(
                          jsonb_build_object(
                            'PartitionKey', task_id,
                            'RowKey', 'task',
                            'taskId', slugid_to_uuid(task_id),
                            'provisionerId', provisioner_id,
                            'workerType', worker_type,
                            'schedulerId', scheduler_id,
                            'taskGroupId', slugid_to_uuid(task_group_id),
                            'requires', requires::text,
                            'priority', priority::text,
                            'retries', retries,
                            'retriesLeft', retries_left,
                            'created', created,
                            'deadline', deadline,
                            'expires', expires,
                            'takenUntil', coalesce(taken_until, '1970-01-01 00:00:00+00'::timestamptz)),
                          'dependencies', dependencies::text),
                        'routes', routes::text),
                      'scopes', scopes::text),
                    'payload', payload::text),
                  'metadata', metadata::text),
                'tags', tags::text),
              'extra', extra::text),
            'runs', runs::text) as value,
          1 as version,
          tasks.etag as etag
        from tasks
        where
          tasks.task_id = partition_key;
      end
    $$ language plpgsql;

    create or replace function
    queue_tasks_entities_create(pk text, rk text, properties jsonb, overwrite boolean, version integer)
    returns uuid
    as $$
      declare
        new_row tasks%ROWTYPE;
      begin
        select
          uuid_to_slugid(properties ->> 'taskId'),
          (properties ->> 'provisionerId')::text,
          (properties ->> 'workerType')::text,
          (properties ->> 'schedulerId')::text,
          uuid_to_slugid(properties ->> 'taskGroupId')::text,
          entity_buf_decode(properties, 'dependencies')::jsonb,
          (properties ->> 'requires')::task_requires,
          entity_buf_decode(properties, 'routes')::jsonb,
          (properties ->> 'priority')::task_priority,
          (properties ->> 'retries')::int,
          (properties ->> 'retriesLeft')::int,
          (properties ->> 'created')::timestamptz,
          (properties ->> 'deadline')::timestamptz,
          (properties ->> 'expires')::timestamptz,
          entity_buf_decode(properties, 'scopes')::jsonb,
          entity_buf_decode(properties, 'payload')::jsonb,
          entity_buf_decode(properties, 'metadata')::jsonb,
          entity_buf_decode(properties, 'tags')::jsonb,
          entity_buf_decode(properties, 'extra')::jsonb,
          entity_buf_decode(properties, 'runs')::jsonb,
          case (properties ->> 'takenUntil')::timestamptz
            when '1970-01-01 00:00:00+00'::timestamptz then null
            else (properties ->> 'takenUntil')::timestamptz
          end,
          false,
          public.gen_random_uuid()
        into new_row;
        if overwrite then
          raise exception 'overwrite not implemented';
        else
          execute 'insert into tasks select $1.*' using new_row;
        end if;
        return new_row.etag;
      end
    $$ language plpgsql;

    create or replace function
    queue_tasks_entities_remove(partition_key text, row_key text)
    returns table (etag uuid)
    as $$
      begin
        return query delete from tasks
        where
          tasks.task_id = partition_key
        returning tasks.etag;
      end
    $$ language plpgsql;

    create or replace function
    queue_tasks_entities_modify(partition_key text, row_key text, properties jsonb, version integer, old_etag uuid)
    returns table (etag uuid)
    as $$
      declare
        new_etag uuid;
      begin
        -- NOTE: queue only updates runs, retriesLeft, and takenUntil, so only those fields are
        -- supported here.
        new_etag = public.gen_random_uuid();
        update tasks
        set (
          runs,
          retries_left,
          taken_until,
          etag
        ) = (
          entity_buf_decode(properties, 'runs')::jsonb,
          (properties ->> 'retriesLeft')::int,
          case (properties ->> 'takenUntil')::timestamptz
            when '1970-01-01 00:00:00+00'::timestamptz then null
            else (properties ->> 'takenUntil')::timestamptz
          end,
          new_etag
        )
        where
          tasks.task_id = partition_key and
          tasks.etag = queue_tasks_entities_modify.old_etag;
        if found then
          return query select new_etag;
          return;
        end if;
        perform tasks.etag from tasks
        where
          tasks.task_id = partition_key;
        if found then
          raise exception 'unsuccessful update' using errcode = 'P0004';
        else
          raise exception 'no such row' using errcode = 'P0002';
        end if;
      end
    $$ language plpgsql;

    create or replace function
    queue_tasks_entities_scan(pk text, rk text, condition text, size integer, page integer)
    returns table (partition_key text, row_key text, value jsonb, version integer, etag uuid)
    as $$
      declare
        cond text[];
        exp_cond_field text;
        exp_cond_operator text;
        exp_cond_operand timestamptz;
      begin
        if not condition is null then
          cond := regexp_split_to_array(condition, '\s+');
          exp_cond_field := trim(cond[3], '''');
          exp_cond_operator := cond[4];
          exp_cond_operand := cond[5] :: timestamptz;

          if not (exp_cond_field || exp_cond_operator) in ('takenUntil=', 'deadline=', 'expires<') then
            raise exception 'queue_tasks_entities_scan only supports certain takenUntil, deadline, and expires conditions';
          end if;
        end if;

        return query select
          task_id as partition_key,
          'task' as row_key,
          entity_buf_encode(
            entity_buf_encode(
              entity_buf_encode(
                entity_buf_encode(
                  entity_buf_encode(
                    entity_buf_encode(
                      entity_buf_encode(
                        entity_buf_encode(
                          jsonb_build_object(
                            'PartitionKey', task_id,
                            'RowKey', 'task',
                            'taskId', slugid_to_uuid(task_id),
                            'provisionerId', provisioner_id,
                            'workerType', worker_type,
                            'schedulerId', scheduler_id,
                            'taskGroupId', slugid_to_uuid(task_group_id),
                            'requires', requires::text,
                            'priority', priority::text,
                            'retries', retries,
                            'retriesLeft', retries_left,
                            'created', created,
                            'deadline', deadline,
                            'expires', expires,
                            'takenUntil', coalesce(taken_until, '1970-01-01 00:00:00+00'::timestamptz)),
                          'dependencies', dependencies::text),
                        'routes', routes::text),
                      'scopes', scopes::text),
                    'payload', payload::text),
                  'metadata', metadata::text),
                'tags', tags::text),
              'extra', extra::text),
            'runs', runs::text) as value,
          1 as version,
          tasks.etag as etag from tasks
        where
          (pk is NULL or pk = task_id) and
          case
            when exp_cond_field = 'deadline' then deadline = exp_cond_operand
            -- note that queue never queries for takenUntil = new Date(0)
            when exp_cond_field = 'takenUntil' then taken_until = exp_cond_operand
            when exp_cond_field = 'expires' then expires < exp_cond_operand
            else true
          end
        order by tasks.task_id
        limit case
          when (size is not null and size > 0) then size + 1
          else null
        end
        offset case
          when (page is not null and page > 0) then page
          else 0
        end;
      end
    $$ language plpgsql;

    create or replace function
    queue_task_group_members_entities_load(partition_key text, row_key text)
    returns table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid)
    as $$
      begin
        return query
        select
          task_group_id,
          task_id,
          jsonb_build_object(
            'PartitionKey', task_group_id,
            'RowKey', task_id,
            'taskId', slugid_to_uuid(task_id),
            'taskGroupId', slugid_to_uuid(task_group_id),
            'expires', expires) as value,
          1 as version,
          tasks.etag as etag
        from tasks
        where
          tasks.task_group_id = partition_key and
          tasks.task_id = row_key;
      end
    $$ language plpgsql;

    create or replace function
    queue_task_group_members_entities_create(pk text, rk text, properties jsonb, overwrite boolean, version integer)
    returns uuid
    as $$
      begin
        return public.gen_random_uuid();
      end
    $$ language plpgsql;

    create or replace function
    queue_task_group_members_entities_remove(partition_key text, row_key text)
    returns table (etag uuid)
    as $$
      begin
        return query
        select tasks.etag
        from tasks
        where
          tasks.task_group_id = partition_key and
          tasks.task_id = row_key;
      end
    $$ language plpgsql;

    create or replace function
    queue_task_group_members_entities_modify(partition_key text, row_key text, properties jsonb, version integer, old_etag uuid)
    returns table (etag uuid)
    as $$
      begin
        raise exception 'modify not implemented for queue_task_group_members_entities';
      end
    $$ language plpgsql;

    create or replace function
    queue_task_group_members_entities_scan(pk text, rk text, condition text, size integer, page integer)
    returns table (partition_key text, row_key text, value jsonb, version integer, etag uuid)
    as $$
      declare
        cond text[];
        exp_cond_field text;
        exp_cond_operator text;
        exp_cond_operand timestamptz;
      begin
        if pk is null then
          -- if pk is null, then this is the expiration scan for the members table; since
          -- there is no members table, we stub this out by simply returning an empty set,
          -- ignoring the condition
          return;
        end if;

        if not condition is null then
          cond := regexp_split_to_array(condition, '\s+');
          exp_cond_field := trim(cond[3], '''');
          exp_cond_operator := cond[4];
          exp_cond_operand := cond[5] :: timestamptz;

          if exp_cond_operator != '>=' or exp_cond_field != 'expires' then
            raise exception 'queue_task_group_memberss_entities_scan only supports `expires >= <timestamp>` conditions';
          end if;
        end if;

        return query
        select
          task_group_id,
          task_id,
          jsonb_build_object(
            'PartitionKey', task_group_id,
            'RowKey', task_id,
            'taskId', slugid_to_uuid(task_id),
            'taskGroupId', slugid_to_uuid(task_group_id),
            'expires', expires) as value,
          1 as version,
          tasks.etag as etag
        from tasks
        where
          tasks.task_group_id = pk and
          (exp_cond_operand is NULL or expires >= exp_cond_operand)
        order by tasks.task_id
        limit case
          when (size is not null and size > 0) then size + 1
          else null
        end
        offset case
          when (page is not null and page > 0) then page
          else 0
        end;
      end
    $$ language plpgsql;

    create or replace function
    queue_task_group_active_sets_entities_load(partition_key text, row_key text)
    returns table (partition_key_out text, row_key_out text, value jsonb, version integer, etag uuid)
    as $$
      begin
        return query
        select
          task_group_id,
          task_id,
          jsonb_build_object(
            'PartitionKey', task_group_id,
            'RowKey', task_id,
            'taskId', slugid_to_uuid(task_id),
            'taskGroupId', slugid_to_uuid(task_group_id),
            'expires', expires) as value,
          1 as version,
          tasks.etag as etag
        from tasks
        where
          not ever_resolved and
          tasks.task_group_id = partition_key and
          tasks.task_id = row_key;
      end
    $$ language plpgsql;

    create or replace function
    queue_task_group_active_sets_entities_create(pk text, rk text, properties jsonb, overwrite boolean, version integer)
    returns uuid
    as $$
      begin
        -- this method is only called before the task is created, and tasks are
        -- created in an unresolved state, so there's nothing to do here.  Note
        -- that the service does not mark a task as unresolved when rerunning it
        return public.gen_random_uuid();
      end
    $$ language plpgsql;

    create or replace function
    queue_task_group_active_sets_entities_remove(partition_key text, row_key text)
    returns table (etag uuid)
    as $$
      begin
        -- DependencyTracker uses this to mark a task as ever_resolved
        update tasks
        set ever_resolved = true
        where 
          tasks.task_group_id = partition_key and
          tasks.task_id = row_key;
        return query select public.gen_random_uuid() as etag;
      end
    $$ language plpgsql;

    create or replace function
    queue_task_group_active_sets_entities_modify(partition_key text, row_key text, properties jsonb, version integer, old_etag uuid)
    returns table (etag uuid)
    as $$
      begin
        raise exception 'modify not supported';
      end
    $$ language plpgsql;
    
    create or replace function
    queue_task_group_active_sets_entities_scan(pk text, rk text, condition text, size integer, page integer)
    returns table (partition_key text, row_key text, value jsonb, version integer, etag uuid)
    as $$
      declare
        cond text[];
        exp_cond_field text;
        exp_cond_operator text;
        exp_cond_operand timestamptz;
      begin
        if not condition is null then
          cond := regexp_split_to_array(condition, '\s+');
          exp_cond_field := trim(cond[3], '''');

          if exp_cond_field != 'expires' then
            raise exception 'queue_task_group_active_sets_entities_scan only supports filtering for expired rows';
          end if;

          -- there's no distinct table to expire, so just return an empty set to make the
          -- expiration crontask finish immediately
          return;
        end if;

        -- the idea here is to use the tasks_task_group_id_unresolved_idx index for a quick response
        return query select
          task_group_id as partition_key,
          task_id as row_key,
          jsonb_build_object(
            'PartitionKey', task_group_id,
            'RowKey', task_id,
            'taskGroupId', slugid_to_uuid(task_group_id),
            'taskId', slugid_to_uuid(task_id),
            'expires', expires) as value,
          1 as version,
          public.gen_random_uuid() as etag
        from tasks
        where
          (pk is NULL or pk = task_group_id) and
          not ever_resolved
        order by tasks.task_group_id, tasks.task_id
        limit case
          when (size is not null and size > 0) then size + 1
          else null
        end
        offset case
          when (page is not null and page > 0) then page
          else 0
        end;
      end
    $$ language plpgsql;

    -- drop the old tables
    revoke select, insert, update, delete on queue_tasks_entities from $db_user_prefix$_queue;
    drop table queue_tasks_entities;
	revoke select, insert, update, delete on queue_task_group_members_entities from $db_user_prefix$_queue;
	drop table queue_task_group_members_entities;
	revoke select, insert, update, delete on queue_task_group_active_sets_entities from $db_user_prefix$_queue;
	drop table queue_task_group_active_sets_entities;

    -- and drop these helper functions.. the migration is done
    drop function v20_migration_migrate_tasks(task_ids_after text, count int);
    drop function v20_migration_is_complete();
    drop function v20_migration_finish();
  end
  $x$ 
  language plpgsql;

end
