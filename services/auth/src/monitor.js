const MonitorManager = require('taskcluster-lib-monitor');

const manager = new MonitorManager({
  serviceName: 'auth',
});

manager.register({
  name: 'signatureValidation',
  title: 'Signature Validation',
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
    clientId: 'The clientId that was authenticated.',
    expires: 'After this time the authentication is no longer valid.',
    scopes: 'All scopes that this client has available.',
    status: 'Whether or not the authentication was successful.',
    scheme: 'Currently always `hawk`.',
    message: 'A reason for failure if failed. Otherwise empty.',
    host: 'The hostname of the authorizer of the request.',
    hash: 'The hash of the request payload of the original request, if there was one.',
    port: 'The port of the original request.',
    resource: 'The path of the original request',
    method: 'HTTP method of the original request.',
    sourceIp: 'The ip address of the original request.',
  },
});

module.exports = manager;
