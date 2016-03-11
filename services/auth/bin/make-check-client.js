var taskcluster   = require('taskcluster-client');

if (!module.parent) {
  // use the root credentials from the environment (this is meant to be run from `heroku run`)
  var auth = new taskcluster.Auth({
    baseUrl: "https://taskcluster-auth-staging.herokuapp.com/v1/",
    credentials: {
      clientId: "root",
      accessToken: process.env.ROOT_ACCESS_TOKEN
    },
  });

  // invent a client name
  var clientId = "project/taskcluster/tc-auth/staging-check/" + taskcluster.slugid()

  auth.createClient(clientId, {
    expires: new Date(3000, 1, 1),
    description: "test credentials for checkStaging",
    scopes: [
      'auth:create-client:garbage/*',
      'auth:delete-client:garbage/*',
    ],
  }).then(function(res) {
    console.log("Add the following to your user-config.yml:");
    console.log("test:");
    console.log("  checkStaging:");
    console.log("    credentials:");
    console.log("      clientId: " + JSON.stringify(res.clientId));
    console.log("      accessToken: " + JSON.stringify(res.accessToken));
    process.exit(0);
  });
}
