begin
  -- lock this table before reading from it, to prevent loss of concurrent
  -- updates when the table is dropped.
  lock table worker_specs;

  -- TODO: undo migration here

  revoke select, insert, update, delete on queue_provisioners from $db_user_prefix$_worker_manager;
  drop table worker_specs;
end
