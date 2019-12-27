const taskcluster = require('taskcluster-client');
const assert = require('assert');

exports.scopeExpression = {
  AllOf: [
    "auth:create-role:project:taskcluster:smoketest:*",
    "auth:delete-role:project:taskcluster:smoketest:*",
    "auth:update-role:project:taskcluster:smoketest:*",
    "project:taskcluster:smoketest:*",
  ],
};

exports.tasks = [];
exports.tasks.push({
  title: 'Create role and expand smoketest (--target roles)',
  requires: [
    'ping-auth',
  ],
  provides: [
    'target-roles',
  ],
  run: async () => {
    const auth = new taskcluster.Auth(taskcluster.fromEnvVars());
    const randomId = taskcluster.slugid();
    const roleId = `project:taskcluster:smoketest:${randomId}:*`;

    const payload = {
      description: 'smoketest for creating a role and expanding it',
      scopes: ['project:taskcluster:smoketest:<..>/*'],
    };
    await auth.createRole(roleId, payload);

    const expandPayload = {
      scopes: [`assume:project:taskcluster:smoketest:${randomId}:abc`],
    };
    const expandedRole = await auth.expandScopes(expandPayload);

    const expectedScopes = {
      scopes:
      [ `assume:project:taskcluster:smoketest:${randomId}:abc`,
        'project:taskcluster:smoketest:abc/*' ],
    };
    assert.deepEqual(expandedRole.scopes, expectedScopes.scopes);

    // clean up our own role..
    await auth.deleteRole(roleId);

    // clean up any leftover roles, in case previous runs crashed or failed
    const query = {};
    const anHourAgo = Date.now() - (1000 * 60 * 60);
    while (1) {
      const res = await auth.listRoles2();
      for(let role of res.roles){
        if(role.roleId.includes('project:taskcluster:smoketest:') &&
           new Date(role.lastModified) < new Date(anHourAgo)){
          await auth.deleteRole(role.roleId);
        }
      }
      if (res.continuationToken) {
        query.continuationToken = res.continuationToken;
      } else {
        break;
      }
    }
  },
});
