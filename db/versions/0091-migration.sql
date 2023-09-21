begin
  -- migration is only possible when all tasks were migrated to new column structure
  -- TODO: would be better to wait before all records are migrated and not block the migration here
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
  -- queries: what tasks are not scheduled for given task_group_id/scheduler_id
  -- purpose: not much since this will have short-lived data
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
  CREATE INDEX queue_resolved_task_vis_idx ON queue_resolved_tasks (visible);

  -- Claimed Tasks
  -- queries: what tasks are running and waiting to be reclaimed or resolved
  CREATE TABLE queue_claimed_tasks (
    task_id text not null,
    run_id integer not null,
    claimed timestamptz not null,
    taken_until timestamptz not null,
    visible timestamptz not null,
    pop_receipt uuid null
  );

  -- migrate data to resolved queue
  INSERT INTO
    queue_claimed_tasks (task_id, run_id, claimed, taken_until, visible, pop_receipt)
  SELECT
    convert_from(decode(message_text, 'base64'), 'utf-8')::jsonb->>'taskId',
    CAST(convert_from(decode(message_text, 'base64'), 'utf-8')::jsonb->>'runId' AS INTEGER),
    inserted,
    CAST(convert_from(decode(message_text, 'base64'), 'utf-8')::jsonb->>'takenUntil' AS timestamp with time zone),
    visible,
    pop_receipt
  FROM azure_queue_messages
  WHERE queue_name = 'claim-queue'
  AND expires > now();

  CREATE INDEX queue_claimed_task_idx ON queue_claimed_tasks (task_id);
  CREATE INDEX queue_claimed_task_vis_idx ON queue_claimed_tasks (visible);


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

  CREATE UNIQUE INDEX queue_pending_task_idx ON queue_pending_tasks (task_id);
  CREATE INDEX queue_pending_task_vis_idx ON queue_pending_tasks (visible, expires);
  CREATE INDEX queue_pending_task_queue_idx ON queue_pending_tasks (task_queue_id, priority, inserted);

  GRANT select, insert, update, delete ON queue_pending_tasks to $db_user_prefix$_queue;
  GRANT select, insert, update, delete ON queue_task_deadlines to $db_user_prefix$_queue;
  GRANT select, insert, update, delete ON queue_resolved_tasks to $db_user_prefix$_queue;
  GRANT select, insert, update, delete ON queue_claimed_tasks to $db_user_prefix$_queue;

  -- delete old data
  -- or delete whole table? will there be workers still running at the time of migration?
  -- maybe it's better to leave the table as is to let remaining workers finish what was started
  -- and in worst case new workers might restart few tasks
  -- other queues should not suffer much, as deadline/resolved/claims are handling errors
  -- table can be dropped in a followup migration on next release
  -- DELETE FROM azure_queue_messages;
end
