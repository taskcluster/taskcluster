begin
  -- migration is only possible when all tasks were migrated to new column structure
  IF EXISTS (
    SELECT message_id FROM azure_queue_messages
    WHERE queue_name NOT IN ('claim-queue', 'deadline-queue', 'resolved-queue')
    AND task_queue_id IS NULL
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'Not possible to migrate, some records are still in old format';
  END IF;

  -- migration of data
  -- prevent reads and writes from table, get exclusive access
  LOCK TABLE azure_queue_messages;

  -- Task Deadlines
  -- purpose: know when particular task expires, so dependencies/task groups can be resolved
  -- queries: what tasks are not scheduled for given task_group_id/scheduler_id
  CREATE TABLE queue_task_deadlines (
    task_id text not null,
    task_group_id text not null,
    scheduler_id text not null,
    created_at timestamptz not null,
    deadline_at timestamptz not null,
    expires timestamptz not null,
    pop_receipt uuid null
  );

  -- migrate data to deadline queue
  INSERT INTO queue_task_deadlines
    (task_group_id, task_id, scheduler_id, created_at, deadline_at, expires, pop_receipt)
  SELECT
    convert_from(decode(message_text, 'base64'), 'utf-8')::jsonb->>'taskGroupId',
    convert_from(decode(message_text, 'base64'), 'utf-8')::jsonb->>'taskId',
    convert_from(decode(message_text, 'base64'), 'utf-8')::jsonb->>'schedulerId',
    inserted,
    visible, -- when this message becomes visible, it means it hits deadline
    expires,
    pop_receipt
  FROM azure_queue_messages
  WHERE queue_name = 'deadline-queue'
  AND expires > now();

  -- Resolved Tasks
  -- queries: what tasks are not scheduled for given task_group_id/scheduler_id
  -- purpose: not much since this will have short-lived data
  CREATE TABLE queue_resolved_tasks (
    task_group_id text not null,
    task_id text not null,
    scheduler_id text not null,
    resolution text not null,
    resolved_at timestamptz not null,
    expires timestamptz not null,
    pop_receipt uuid null
  );

  -- migrate data to resolved queue
  INSERT INTO
    queue_resolved_tasks (task_id, task_group_id, scheduler_id, resolution, resolved_at, expires, pop_receipt)
  SELECT
    convert_from(decode(message_text, 'base64'), 'utf-8')::jsonb->>'taskId',
    convert_from(decode(message_text, 'base64'), 'utf-8')::jsonb->>'taskGroupId',
    convert_from(decode(message_text, 'base64'), 'utf-8')::jsonb->>'schedulerId',
    convert_from(decode(message_text, 'base64'), 'utf-8')::jsonb->>'resolution',
    inserted,
    expires,
    pop_receipt
  FROM azure_queue_messages
  WHERE queue_name = 'resolved-queue'
  AND expires > now();

  -- Claimed Tasks
  -- queries: what tasks are running and waiting to be reclaimed or resolved
  CREATE TABLE queue_claimed_tasks (
    task_id text not null,
    run_id integer not null,
    claimed_at timestamptz not null,
    taken_until timestamptz not null,
    expires timestamptz not null,
    pop_receipt uuid null
  );

  -- migrate data to resolved queue
  INSERT INTO
    queue_claimed_tasks (task_id, run_id, claimed_at, taken_until, expires, pop_receipt)
  SELECT
    convert_from(decode(message_text, 'base64'), 'utf-8')::jsonb->>'taskId',
    CAST(convert_from(decode(message_text, 'base64'), 'utf-8')::jsonb->>'runId' AS INTEGER),
    inserted,
    CAST(convert_from(decode(message_text, 'base64'), 'utf-8')::jsonb->>'takenUntil' AS timestamp with time zone),
    expires,
    pop_receipt
  FROM azure_queue_messages
  WHERE queue_name = 'claim-queue'
  AND expires > now();

  -- Pending (scheduled)
  -- purpose: keep the record of all tasks that were scheduled and claimed
  -- queries:
  --  * what tasks are pending for a given queue
  --  * what tasks are claimed and still running (for claim expire purpose)
  --  * find tasks that were claimed but not resolved (for claim expire purpose)
  CREATE TABLE queue_pending_tasks (
    task_queue_id text not null,
    priority int not null,
    task_id text not null, -- should be unique and a key
    run_id integer not null,
    hint_id text not null, -- to know that task was claimed properly, stored inside tasks.runs[]
    inserted_at timestamptz not null,
    expires timestamptz not null,
    pop_receipt uuid null
  );

  CREATE UNIQUE INDEX "task_id" ON "public"."queue_pending_tasks" USING BTREE ("task_id");

  -- rest goes into queue_pending_tasks
  INSERT INTO queue_pending_tasks
    (task_queue_id, priority, task_id, run_id, hint_id, inserted_at, expires, pop_receipt)
  SELECT
    task_queue_id,
    priority,
    convert_from(decode(message_text, 'base64'), 'utf-8')::jsonb->>'taskId',
    CAST(convert_from(decode(message_text, 'base64'), 'utf-8')::jsonb->>'runId' AS INTEGER),
    convert_from(decode(message_text, 'base64'), 'utf-8')::jsonb->>'hintId',
    inserted,
    expires,
    pop_receipt
  FROM azure_queue_messages
  WHERE queue_name NOT IN ('claim-queue', 'deadline-queue', 'resolved-queue')
  AND task_queue_id IS NOT NULL
  AND expires > now();

  -- apply indexes

  GRANT select, insert, update, delete ON queue_pending_tasks to $db_user_prefix$_queue;
  GRANT select, insert, update, delete ON queue_task_deadlines to $db_user_prefix$_queue;
  GRANT select, insert, update, delete ON queue_resolved_tasks to $db_user_prefix$_queue;
  GRANT select, insert, update, delete ON queue_claimed_tasks to $db_user_prefix$_queue;

  -- delete old data
  DELETE FROM azure_queue_messages;
end
