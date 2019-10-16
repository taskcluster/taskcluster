const taskcluster = require('taskcluster-client');

exports.tasks = [];
exports.tasks.push({
  title: 'Create role and expand smoketest',
  requires: [],
  provides: [
    'role-create-expand',
  ],
  run: async () => {
    let role = new taskcluster.Auth(taskcluster.fromEnvVars());
    let randomId = taskcluster.slugid();
    let roleId = `project:taskcluster:smoketest:${randomId}`;
    let payload = {
      description: 'smoketest test',
      scopes: ['project:taskcluster:smoketest:*'],
    };
    await role.createRole(roleId, payload);
    await role.deleteRole(roleId);
  },
});
