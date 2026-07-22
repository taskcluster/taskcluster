import { MonitorManager } from '@taskcluster/lib-monitor';

MonitorManager.register({
  name: 'hookFire',
  title: 'A hook was fired',
  type: 'hook-fire',
  version: 1,
  level: 'info',
  description: `
    A hook was fired, meaning that a task was created for it.  This is also
    logged when the attempt to fire the hook failed, in which case the 'result'
    field is "failed".  Since this is often the result of user error, the error
    message itself is not included; consult the last-fires for the indicated
    hook to see them.
  `,
  fields: {
    hookGroupId: 'The group ID of the hook that failed',
    hookId: 'The ID of the hook that failed',
    firedBy: 'The event leading to the hook being fired',
    taskId: 'The taskId of the task that was (or would have been) created',
    result: '"success" (task created), "failure" (task not created), or "declined" (hook did not generate a task)"',
  },
});

MonitorManager.register({
  name: 'hookPulseMessageDiscarded',
  title: 'A pulse message for a hook was discarded',
  type: 'hook-pulse-message-discarded',
  version: 1,
  level: 'notice',
  description: `
    A pulse message matched a hook's bindings, but was discarded before
    firing the hook. This log type is sampled to avoid being noisy.
  `,
  fields: {
    hookGroupId: 'The group ID of the hook that matched the pulse message',
    hookId: 'The ID of the hook that matched the pulse message',
    exchange: 'The pulse exchange that delivered the message',
    routingKey: 'The pulse routing key that delivered the message',
    reason: 'The reason the pulse message was discarded',
    validationError: 'The triggerSchema validation error that caused the discard',
    discardedCount: 'Number of pulse messages discarded by this listener for this reason since it was created',
    message: 'A short human-readable description of the discard',
  },
});
