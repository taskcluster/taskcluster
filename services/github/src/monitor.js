const {MonitorManager} = require('taskcluster-lib-monitor');

/**
 * For ease of debugging, the following top-level fields are shared by all
 * log messages concerning them:
 *
 *  - eventId
 *  - installationId
 *
 * This allows a search for a single value in these fields to return the
 * "story" of that resource.  For example, searching for `eventId =
 * '111-22-333'` will find all log messages regarding that webhook delivery.
 */

MonitorManager.register({
  name: 'webhookReceived',
  title: 'Webhook Received',
  type: 'webhook-received',
  version: 1,
  level: 'notice',
  description: `A valid webhook payload was received from GitHub.`,
  fields: {
    eventId: 'The GUID of this webhook delivery (`X-GitHub-Delivery` header)',
    eventType: 'The event type (`X-GitHub-Event` header)',
    installationId: 'The installation ID associated with this event (`installation.id`), if any',
  },
});

MonitorManager.register({
  name: 'handlerDebug',
  title: 'Event Handler Debug Information',
  type: 'handler-debug',
  version: 1,
  level: 'debug',
  description: `
    Narrative debug logging for event handling.  These messages have attributes that
    can be useful in filtering to a specific event, but note that all fields are not
    always available.  For example, when a task completes, the eventId that led to
    the task's creation is not available and not logged.
  `,
  fields: {
    eventId: 'The GUID of the webhook delivery (`X-GitHub-Delivery` header), if any',
    installationId: 'The installation ID associated with this event (`installation.id`), if any',
    taskGroupId: 'The taskGroupId of the affected tasks, if any',
    taskId: 'The taskId of the affected task, if any',
    owner: 'The repository owner (organization or username), if any',
    repo: 'The repository name, if any',
    sha: 'The SHA of the commit being addressed, if any',
    message: 'Free-form message',
  },
});
