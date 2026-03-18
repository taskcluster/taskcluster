import taskcluster from '@taskcluster/client';
import assert from 'node:assert';

export const scopeExpression = {
  AllOf: ['secrets:get:project/taskcluster/smoketest/*', 'secrets:set:project/taskcluster/smoketest/*'],
};

export const tasks = [];

tasks.push({
  title: 'Create and read secrets (--target secrets)',
  requires: ['ping-secrets'],
  provides: ['target-secrets'],
  run: async () => {
    const secrets = new taskcluster.Secrets(taskcluster.fromEnvVars());
    const secretName = taskcluster.slugid();
    const secretPrefix = `project/taskcluster/smoketest/${secretName}`;
    const payload = {
      expires: taskcluster.fromNowJSON('2 minutes'),
      secret: {
        description: `Secret ${secretName}`,
        type: 'object',
      },
    };
    await secrets.set(secretPrefix, payload);
    const getSecret = await secrets.get(secretPrefix);
    assert.deepEqual(getSecret.secret, payload.secret);
    await secrets.remove(secretPrefix);
    await assert.rejects(
      () => secrets.get(secretPrefix),
      (err) => {
        assert.equal(err.code, 'ResourceNotFound');
        assert.equal(err.statusCode, 404);
        return true;
      },
    );
  },
});
