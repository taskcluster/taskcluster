const taskcluster = require('taskcluster-client');
const assert = require('assert');

exports.scopeExpression = {
  AllOf: [
    'secrets:get:project/taskcluster/smoketest/*',
    'secrets:set:project/taskcluster/smoketest/*',
  ],
};

exports.tasks = [];

exports.tasks.push({
  title: 'Create and read secrets (--target secrets)',
  requires: [],
  provides: [
    'target-secrets',
  ],
  run: async () => {
    let secrets = new taskcluster.Secrets(taskcluster.fromEnvVars());
    let secretName = taskcluster.slugid();
    let secretPrefix = `project/taskcluster/smoketest/${secretName}`;
    const payload = {
      "expires": taskcluster.fromNowJSON('2 minutes'),
      "secret": {
        "description": `Secret ${secretName}`,
        "type": "object",
      },
    };
    await secrets.set(secretPrefix, payload);
    const getSecret = await secrets.get(secretPrefix);
    assert.deepEqual(getSecret.secret, payload.secret);
    await secrets.remove(secretPrefix);
    await assert.rejects(
      () => secrets.get(secretPrefix),
      err => {
        assert.equal(err.code, 'ResourceNotFound');
        assert.equal(err.statusCode, 404);
        return true;
      }
    );
  },
});
