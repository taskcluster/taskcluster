const taskcluster = require('taskcluster-client');
const assert = require('assert');

exports.tasks = [];
exports.tasks.push({
  title: 'Create role and expand smoketest (--target roles)',
  requires: [],
  provides: [
    'target-roles',
  ],
  run: async () => {
    let auth = new taskcluster.Auth(taskcluster.fromEnvVars());
    let randomId = taskcluster.slugid();
    let roleId = `project:taskcluster:smoketest:${randomId}`;
    let payload = {
      description: 'smoketest test',
      scopes: ['project:taskcluster:smoketest:*'],
    };
    let expandPayload = {
      scopes: [`assume:${roleId}`],
    };
    let roleCreated = await auth.createRole(roleId, payload);
    let expandedRole = await auth.expandScopes(expandPayload);
    assert.deepEqual(roleCreated.expandedScopes, expandedRole.scopes);
    await auth.deleteRole(roleId);
  },
});
