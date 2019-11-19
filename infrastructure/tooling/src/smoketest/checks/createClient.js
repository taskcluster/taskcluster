const taskcluster = require('taskcluster-client');

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
  run: async () => {
    const auth = new taskcluster.Auth(taskcluster.fromEnvVars());
    const randomId = taskcluster.slugid();

    let clientId = `project/taskcluster/smoketest/${randomId}`;
    const payload = {
      "expires": taskcluster.fromNowJSON('1 hour'),
      "description": `Create a client and use it ${clientId}`,
      "scopes": [`auth:reset-access-token:project/taskcluster/smoketest/${randomId}`],
    };
    const created = await auth.createClient(clientId, payload);

    // try using that new client
    const accessToken = created.accessToken;
    const auth2 = new taskcluster.Auth({
      rootUrl: process.env.TASKCLUSTER_ROOT_URL,
      credentials: {clientId, accessToken},
    });
    await auth2.resetAccessToken(clientId);

    // delete the new client
    await auth.deleteClient(clientId);
  },
});
