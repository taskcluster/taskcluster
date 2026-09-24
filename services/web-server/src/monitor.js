import { MonitorManager } from '@taskcluster/lib-monitor';

MonitorManager.register({
  name: 'createCredentials',
  title: 'Credentials Created',
  type: 'create-credentials',
  version: 1,
  level: 'info',
  description: 'A client has been issued Taskcluster credentials',
  fields: {
    clientId: 'The clientId of the issued credentials',
    userIdentity: 'The identity of the user to which the credentials were issued',
    expires: 'Date time when the issued credentials expires.',
  },
});

MonitorManager.register({
  name: 'bindPulseSubscription',
  title: 'Bind a Pulse Subscription',
  type: 'bind-pulse-subscription',
  version: 1,
  level: 'debug',
  description: `
    The PulseEngine has created a queue and bound it to one or more exchanges in
    response to a /subscription WebSocket subscribe request.`,
  fields: {
    subscriptionId: 'The subscriptionId, which will also appear in the AMQP queue name',
  },
});

MonitorManager.register({
  name: 'unbindPulseSubscription',
  title: 'Unbind a Pulse Subscription',
  type: 'unbind-pulse-subscription',
  version: 1,
  level: 'debug',
  description: `
    The PulseEngine has deleted a queue bound to one or more exchanges in
    response to termination of a /subscription WebSocket subscription.`,
  fields: {
    subscriptionId: 'The subscriptionId, which will also appear in the AMQP queue name',
  },
});

MonitorManager.register({
  name: 'websocketConnected',
  title: 'WebSocket Connected',
  type: 'websocket-connected',
  version: 1,
  level: 'debug',
  description: `
    A client has authenticated a /subscription WebSocket connection.`,
  fields: {
    clientId: 'The clientId of the connected client, or "anonymous"',
  },
});

MonitorManager.register({
  name: 'websocketClosed',
  title: 'WebSocket Closed',
  type: 'websocket-closed',
  version: 1,
  level: 'debug',
  description: `
    A /subscription WebSocket connection has closed; any subscriptions still open
    on it have been unsubscribed.`,
  fields: {
    closeCode: 'The WebSocket close code',
    openSubscriptions: 'The number of subscriptions that were still open at close time',
  },
});

MonitorManager.register({
  name: 'websocketOriginRejected',
  title: 'WebSocket Origin Rejected',
  type: 'websocket-origin-rejected',
  version: 1,
  level: 'warning',
  description: `
    A /subscription WebSocket handshake was rejected because its Origin header
    is not in the configured allowedCORSOrigins.`,
  fields: {
    origin: 'The rejected Origin header value',
  },
});
