const {defaultMonitorManager} = require('taskcluster-lib-monitor');

const monitorManager = defaultMonitorManager.configure({
  serviceName: 'web-server',
});

monitorManager.register({
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

monitorManager.register({
  name: 'bindPulseSubscription',
  title: 'Bind a Pulse Subscription',
  type: 'bind-pulse-subscription',
  version: 1,
  level: 'debug',
  description: `
    The PulseEngine has created a queue and bound it to one or more exchanges in
    response to a GraphQL subsscription request.`,
  fields: {
    subscriptionId: 'The subscriptionId, which will also appear in the AMQP queue name',
  },
});

monitorManager.register({
  name: 'unbindPulseSubscription',
  title: 'Unbind a Pulse Subscription',
  type: 'unbind-pulse-subscription',
  version: 1,
  level: 'debug',
  description: `
    The PulseEngine has deleted a queue bound to one or more exchanges in
    response to termination of a GraphQL subsscription request.`,
  fields: {
    subscriptionId: 'The subscriptionId, which will also appear in the AMQP queue name',
  },
});

monitorManager.register({
  name: 'requestReceived',
  title: 'Request Received',
  type: 'request-received',
  version: 1,
  level: 'info',
  description: 'A GraphQL request has been received.',
  fields: {
    query: 'The graphQL query string',
    operationName: `
      The name of the graphql query performed. If the operation is anonymous
      (i.e., the operation is query { ... } instead of query NamedQuery { ... })
      , then operationName is null.`,
    variables: 'Object that contains all of the variables passed to the GraphQL query.',
    requestId: 'A unique request ID for every incoming GraphQL request that the client receives.',
  },
});

module.exports = monitorManager;
