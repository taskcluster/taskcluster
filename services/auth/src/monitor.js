const MonitorManager = require('taskcluster-lib-monitor');

const manager = new MonitorManager({
  serviceName: 'auth',
});

manager.register({
  name: 'signatureValidation',
  type: 'signature-validation',
  version: 1,
  level: 'notice',
  description: `Records results of authenticating a client.
                This contains the verified hawk headers that were sent
                to auth in addition to info about the client.

                In these fields, there are two requests that might be
                mentioned. The first is the original request from a
                client to a service and the second is the request from
                the service to auth itself.`,
  fields: {
    expires: 'After this time the authentication is no longer valid.',
    scopes: 'All scopes that this client has available.',
    clientId: 'The clientId that was authenticated.',
    status: 'Whether or not the authentication was successful.',
    scheme: 'Currently always `hawk`.',
    message: 'A reason for failure if failed. Otherwise empty.',
    hash: 'The hash of the request payload, if there was one.',
    host: 'The hostname of the authorizer of the request.',
    port: 'The port of the request from the authorizer.',
    resource: 'The path that the original request',
    method: 'HTTP method of the original request.',
    sourceIp: 'The ip address the original request came from.',
  },
});

manager.register({
  name: 'scopeResolver',
  type: 'scope-resolver',
  version: 1,
  level: 'debug',
  description: 'Record of a scope resolution.',
  fields: {
    cacheHit: 'True if the resolution was available in the cache.',
  },
});

module.exports = manager;
