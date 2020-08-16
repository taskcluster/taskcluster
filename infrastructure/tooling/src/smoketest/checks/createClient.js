const taskcluster = require('taskcluster-client');
const { retryAssertionFailures } = require('../util');

exports.scopeExpression = {
  AllOf: [
    "auth:create-client:project/taskcluster/smoketest/*",
    "auth:reset-access-token:project/taskcluster/smoketest/*",
    "project:taskcluster:smoketest:*",
  ],
};

exports.tasks = [];

exports.tasks.push({
  title: 'Create client and use it (--target client)',
  requires: ['ping-auth'],
  provides: [
    'target-client',
  ],
  run: async (requirements, utils) => {
    const auth = new taskcluster.Auth(taskcluster.fromEnvVars());
    const randomId = taskcluster.slugid();

    let clientId = `project/taskcluster/smoketest/${randomId}`;
    const payload = {
      "deleteOnExpiration": true,
      "expires": taskcluster.fromNowJSON('1 hour'),
      "description": `Create a client and use it ${clientId}`,
      "scopes": [`auth:reset-access-token:project/taskcluster/smoketest/${randomId}`],
    };
    const created = await auth.createClient(clientId, payload);

    // try using that new client, retrying until the auth service has synchronized
    // the existence of the client.
    await retryAssertionFailures(10, utils, async () => {
      const accessToken = created.accessToken;
      const auth2 = new taskcluster.Auth({
        rootUrl: process.env.TASKCLUSTER_ROOT_URL,
        credentials: { clientId, accessToken },
      });
      await auth2.resetAccessToken(clientId);
    });

    // delete the new client
    await auth.deleteClient(clientId);
  },
});
