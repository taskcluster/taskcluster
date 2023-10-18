import _ from 'lodash';

export const queueUtils = {
  // Create a single instance from a DB row
  fromDb(row) {
    return {
      hookGroupId: row.hook_group_id,
      hookId: row.hook_id,
      queueName: row.queue_name,
      bindings: row.bindings,
    };
  },
};

export const hookUtils = {
  // Create a single instance, or undefined, from a set of rows containing zero
  // or one elements
  fromDbRows(rows) {
    if (rows.length === 1) {
      return hookUtils.fromDb(rows[0]);
    }
  },
  // Create a single instance from a DB row
  fromDb(row) {
    return {
      hookGroupId: row.hook_group_id,
      hookId: row.hook_id,
      metadata: row.metadata,
      task: row.task,
      bindings: row.bindings,
      schedule: row.schedule,
      triggerToken: row.encrypted_trigger_token,
      nextTaskId: row.encrypted_next_task_id,
      nextScheduledDate: row.next_scheduled_date,
      triggerSchema: row.trigger_schema,
    };
  },
  definition(hook) {
    return {
      hookId: hook.hookId,
      hookGroupId: hook.hookGroupId,
      bindings: hook.bindings,
      metadata: _.cloneDeep(hook.metadata),
      task: _.cloneDeep(hook.task),
      schedule: _.cloneDeep(hook.schedule),
      triggerSchema: hook.triggerSchema,
    };
  },
};

export default { hookUtils, queueUtils };
