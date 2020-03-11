const {defaultMonitorManager} = require('taskcluster-lib-monitor');

const monitorManager = defaultMonitorManager.configure({
  serviceName: 'github',
});

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

monitorManager.register({
  name: 'webhookReceived',
  title: 'Webhook Received',
  type: 'webhook-received',
  version: 1,
  level: 'notice',
  description: `
    A valid webhook payload was received from GitHub.
  `,
  fields: {
    eventId: 'The GUID of this webhook delivery (`X-GitHub-Delivery` header)',
    eventType: 'The event type (`X-GitHub-Event` header)',
    installationId: 'The installation ID associated with this event (`installation.id`), if any',
  },
});

module.exports = monitorManager;
