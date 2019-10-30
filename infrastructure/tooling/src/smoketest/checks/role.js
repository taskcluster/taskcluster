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
    const query = {};
    const anHourAgo = Date.now() - (1000*60*60);
    while (1) {
      const res = await auth.listRoles2();
      for(let i=0;i<res.roles.length;i++){
        if(res.roles[i].roleId.includes('project:taskcluster:smoketest:') && res.roles[i].lastModified < anHourAgo){
          await auth.deleteRole(res.roles[i].roleId);
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
