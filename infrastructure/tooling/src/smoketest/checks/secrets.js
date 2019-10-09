const taskcluster = require('taskcluster-client');
const assert = require('assert');

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
    let secretName = taskcluster.slugid();
    const payload = {
      "expires": taskcluster.fromNowJSON('2 minutes'),
      "secret": {
        "description": secretName,
        "type": "object",
      },
    };
    await secrets.set(baseUrl, payload);
    const getSecret = await secrets.get(baseUrl);
    assert.deepEqual(getSecret.secret, payload.secret);
    await secrets.remove(baseUrl);
    await assert.rejects(
      () => secrets.get(baseUrl),
    ).then(()=>{
      err => assert.equal(err.code, 404);
    });
  },
});
