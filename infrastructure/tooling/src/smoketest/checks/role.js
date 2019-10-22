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
    const auth = new taskcluster.Auth(taskcluster.fromEnvVars());
    const randomId = taskcluster.slugid();
    const roleId = `project:taskcluster:smoketest:${randomId}:*`;
    const payload = {
      description: 'smoketest test',
      scopes: ['project:taskcluster:smoketest:<..>/*'],
    };
    const expandPayload = {
      scopes: [`assume:project:taskcluster:smoketest:${randomId}:abc`],
    };
    await auth.createRole(roleId, payload);
    const expandedRole = await auth.expandScopes(expandPayload);
    const expectedScopes = {
      scopes:
      [ `assume:project:taskcluster:smoketest:${randomId}:abc`,
        'project:taskcluster:smoketest:abc/*' ],
    };
    assert.deepEqual(expandedRole.scopes, expectedScopes.scopes);
    await auth.deleteRole(roleId);
  },
});
