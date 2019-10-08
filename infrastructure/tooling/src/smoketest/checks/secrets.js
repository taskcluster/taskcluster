const taskcluster = require('taskcluster-client');

exports.tasks = [];
exports.tasks.push({
  title: 'Create secret/read-it-back check',
  requires: [],
  provides: [
    'smoke-secret',
  ],
  run: async () => {
    let secrets = new taskcluster.Secrets(taskcluster.fromEnvVars());
    let baseUrl = 'project/taskcluster/smoketest/';
    const payload = {
      "expires": "2030-10-08T02:59:43.613Z",
      "secret": {
        "description": "Outreachy Applicant",
        "type": "object",
      },
    };
    await secrets.set(baseUrl, payload);
    const getSecret = await secrets.get(baseUrl);
    if (getSecret.secret.description === payload.secret.description) {
      secrets.remove(baseUrl);
    }
    const getSecretAgain = await secrets.get(baseUrl).catch(function(err){
      return(
        "No Secrets Found" + err
      );
    });
    getSecretAgain!==getSecret? 'Success' : 'Failed';
  },
});
