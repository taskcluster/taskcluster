begin
  -- migration is only possible when all tasks were migrated to new column structure (see version 0090)
  -- if someone upgrades db from 89 to 91 directly it would fail if there are pending tasks
  -- this is to prevent data loss
  IF EXISTS (
    SELECT message_id FROM azure_queue_messages
    WHERE queue_name NOT IN ('claim-queue', 'deadline-queue', 'resolved-queue')
    AND task_queue_id IS NULL
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'Not possible to migrate, some records are still in old format - task_queue_id is NULL for pending tasks';
  END IF;

  -- migration of data
  -- prevent reads and writes from table, get exclusive access
  LOCK TABLE azure_queue_messages;

  -- all new tables use similar approach to process messages in unique manner
  -- by using `pop_receipt` and `visible` columns
  -- when fetched, messages are marked with random uuid in `pop_receipt` column
  -- and `visible` column is set to current time + visibility timeout
  -- When message is processed it is being removed by `(PK, pop_receipt)` columns
  -- to guarantee that concurrent workers are not processing same message

  -- Task Deadlines
  -- A task in this table has not been resolved and the `visible` column corresponds to the deadline of the task.
  CREATE TABLE queue_task_deadlines (
    task_id text not null,
    task_group_id text not null,
    scheduler_id text not null,
    created timestamptz not null,
    deadline timestamptz not null,
    visible timestamptz not null,
    pop_receipt uuid null
  );

  -- migrate data to deadline queue
  INSERT INTO queue_task_deadlines
    (task_group_id, task_id, scheduler_id, created, deadline, visible, pop_receipt)
  SELECT
    convert_from(decode(message_text, 'base64'), 'utf-8')::jsonb->>'taskGroupId',
    convert_from(decode(message_text, 'base64'), 'utf-8')::jsonb->>'taskId',
    convert_from(decode(message_text, 'base64'), 'utf-8')::jsonb->>'schedulerId',
    inserted,
    CAST(convert_from(decode(message_text, 'base64'), 'utf-8')::jsonb->>'deadline' AS timestamp with time zone),
    visible, -- when this message becomes visible, it means it hits deadline
    pop_receipt
  FROM azure_queue_messages
  WHERE queue_name = 'deadline-queue'
  AND expires > now();

  CREATE INDEX queue_task_deadline_idx ON queue_task_deadlines (task_id);
  CREATE INDEX queue_task_deadline_vis_idx ON queue_task_deadlines (visible);

  -- Resolved Tasks
  -- A task has just been resolved and is waiting to be processed by Dependency Resolver
  CREATE TABLE queue_resolved_tasks (
    task_group_id text not null,
    task_id text not null,
    scheduler_id text not null,
    resolution text not null,
    resolved timestamptz not null,
    visible timestamptz not null,
    pop_receipt uuid null
  );

  -- migrate data to resolved queue
  INSERT INTO
    queue_resolved_tasks (task_id, task_group_id, scheduler_id, resolution, resolved, visible, pop_receipt)
  SELECT
    convert_from(decode(message_text, 'base64'), 'utf-8')::jsonb->>'taskId',
    convert_from(decode(message_text, 'base64'), 'utf-8')::jsonb->>'taskGroupId',
    convert_from(decode(message_text, 'base64'), 'utf-8')::jsonb->>'schedulerId',
    convert_from(decode(message_text, 'base64'), 'utf-8')::jsonb->>'resolution',
    inserted,
    visible,
    pop_receipt
  FROM azure_queue_messages
  WHERE queue_name = 'resolved-queue'
  AND expires > now();

  CREATE INDEX queue_resolved_task_idx ON queue_resolved_tasks (task_id);

  -- Claimed Tasks
  -- A task was claimed by worker and is not yet resolved.
  -- Record stays until task is resolved by worker
  -- or failed with `claim-expired` after `taken_until` passes
  CREATE TABLE queue_claimed_tasks (
    task_id text not null,
    run_id integer not null,
    task_queue_id text not null,
    worker_group text not null,
    worker_id text not null,
    claimed timestamptz not null,
    taken_until timestamptz not null,
    visible timestamptz not null,
    pop_receipt uuid null
  );

  -- migrate data to claimed queue
  INSERT INTO
    queue_claimed_tasks (task_id, run_id, task_queue_id, worker_group, worker_id, claimed, taken_until, visible, pop_receipt)
  SELECT
    convert_from(decode(message_text, 'base64'), 'utf-8')::jsonb->>'taskId',
    CAST(convert_from(decode(message_text, 'base64'), 'utf-8')::jsonb->>'runId' AS INTEGER),
    '', -- task_queue_id was not present in old format
    '', -- worker_group was not present in old format
    '', -- worker_id was not present in old format
    inserted,
    CAST(convert_from(decode(message_text, 'base64'), 'utf-8')::jsonb->>'takenUntil' AS timestamp with time zone),
    visible,
    pop_receipt
  FROM azure_queue_messages
  WHERE queue_name = 'claim-queue'
  AND expires > now();

  -- before we could add unique (task_id, run_id) we need to ensure we only keep the latest record in the table
  -- delete all but the latest taken_until
  DELETE FROM queue_claimed_tasks
  WHERE (task_id, run_id, taken_until) NOT IN (
    SELECT task_id, run_id, MAX(taken_until)
    FROM queue_claimed_tasks
    GROUP BY task_id, run_id
  );

  -- we could only have single claim-expire for given run_id
  -- some workers might reclaim tasks more frequently,
  -- so there could be multiple records fro the same run
  CREATE UNIQUE INDEX queue_claimed_task_run_idx ON queue_claimed_tasks (task_id, run_id);
  CREATE INDEX queue_claimed_task_vis_idx ON queue_claimed_tasks (visible);
  CREATE INDEX queue_claimed_task_queue_idx ON queue_claimed_tasks (task_queue_id, worker_group, worker_id);


  -- Pending (scheduled)
  -- A task appears in this table if it is pending,
  -- but a non-pending task may also appear in this table.
  CREATE TABLE queue_pending_tasks (
    task_queue_id text not null,
    priority int not null,
    task_id text not null, -- should be unique and a key
    run_id integer not null,
    hint_id text not null, -- to know that task was claimed properly, stored inside tasks.runs[]
    inserted timestamptz not null,
    expires timestamptz not null,
    visible timestamptz not null,
    pop_receipt uuid null
  );

  -- rest goes into queue_pending_tasks
  INSERT INTO queue_pending_tasks
    (task_queue_id, priority, task_id, run_id, hint_id, inserted, expires, visible, pop_receipt)
  SELECT
    task_queue_id,
    priority,
    convert_from(decode(message_text, 'base64'), 'utf-8')::jsonb->>'taskId',
    CAST(convert_from(decode(message_text, 'base64'), 'utf-8')::jsonb->>'runId' AS INTEGER),
    convert_from(decode(message_text, 'base64'), 'utf-8')::jsonb->>'hintId',
    inserted,
    expires,
    visible,
    pop_receipt
  FROM azure_queue_messages
  WHERE queue_name NOT IN ('claim-queue', 'deadline-queue', 'resolved-queue')
  AND task_queue_id IS NOT NULL
  AND expires > now();

  CREATE INDEX queue_pending_task_idx ON queue_pending_tasks (task_id);
  CREATE INDEX queue_pending_task_vis_idx ON queue_pending_tasks (visible, expires);
  CREATE INDEX queue_pending_task_queue_idx ON queue_pending_tasks (task_queue_id, priority, inserted);

  GRANT select, insert, update, delete ON queue_pending_tasks to $db_user_prefix$_queue;
  GRANT select, insert, update, delete ON queue_task_deadlines to $db_user_prefix$_queue;
  GRANT select, insert, update, delete ON queue_resolved_tasks to $db_user_prefix$_queue;
  GRANT select, insert, update, delete ON queue_claimed_tasks to $db_user_prefix$_queue;

  -- delete existing
  -- DELETE FROM azure_queue_messages;
end
