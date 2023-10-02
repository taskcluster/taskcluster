begin
  -- put back existing task deadlines into azure queue
  -- ignore task_queue_id, priority columns, they are not used for deadlines
  INSERT INTO azure_queue_messages
    (message_id, queue_name, message_text, inserted, visible, expires, pop_receipt)
  SELECT
    message_id_compat,
    'deadline-queue',
    encode(jsonb_build_object(
      'taskId', task_id,
      'taskGroupId', task_group_id,
      'schedulerId', scheduler_id,
      'deadline', deadline
    )::text::bytea, 'base64'),
    created,
    visible,
    deadline + interval '1 day', -- expires value that is not relevant
    pop_receipt
  FROM queue_task_deadlines;



  REVOKE select, insert, update, delete ON queue_task_deadlines FROM $db_user_prefix$_queue;
  DROP TABLE queue_task_deadlines;

  -- put back existing resolved tasks into azure queue
  INSERT INTO azure_queue_messages
    (message_id, queue_name, message_text, inserted, visible, expires, pop_receipt)
  SELECT
    message_id_compat,
    'resolved-queue',
    encode(jsonb_build_object(
      'taskId', task_id,
      'taskGroupId', task_group_id,
      'schedulerId', scheduler_id,
      'resolution', resolution
    )::text::bytea, 'base64'),
    resolved,
    visible,
    resolved + interval '1 day', -- expires value that is not relevant
    pop_receipt
  FROM queue_resolved_tasks;

  REVOKE select, insert, update, delete ON queue_resolved_tasks FROM $db_user_prefix$_queue;
  DROP TABLE queue_resolved_tasks;

  -- put back existing claimed tasks into azure queue
  INSERT INTO azure_queue_messages
    (message_id, queue_name, message_text, inserted, visible, expires, pop_receipt)
  SELECT
    message_id_compat,
    'claim-queue',
    encode(jsonb_build_object(
      'taskId', task_id,
      'runId', run_id,
      'takenUntil', taken_until
    )::text::bytea, 'base64'),
    claimed,
    visible,
    claimed + interval '1 day', -- expires value that is not relevant
    pop_receipt
  FROM queue_claimed_tasks;

  REVOKE select, insert, update, delete ON queue_claimed_tasks FROM $db_user_prefix$_queue;
  DROP TABLE queue_claimed_tasks;


  -- put back existing pending tasks into azure queue
  INSERT INTO azure_queue_messages
    (message_id, queue_name, message_text, inserted, visible, expires, pop_receipt, task_queue_id, priority)
  SELECT
    message_id_compat,
    queue_name_compat,
    encode(jsonb_build_object(
      'taskId', task_id,
      'runId', run_id,
      'hintId', hint_id
    )::text::bytea, 'base64'),
    inserted,
    visible,
    expires,
    pop_receipt,
    task_queue_id,
    priority
  FROM queue_pending_tasks;

  REVOKE select, insert, update, delete ON queue_pending_tasks FROM $db_user_prefix$_queue;
  DROP TABLE queue_pending_tasks;
end
