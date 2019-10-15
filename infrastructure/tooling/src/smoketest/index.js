const {checks, scopeExpression} = require('./checks');
const taskcluster = require('taskcluster-client');
const libScopes = require('taskcluster-lib-scopes');
const {TaskGraph} = require('console-taskgraph');

const main = async (options) => {
  if (!process.env.TASKCLUSTER_ROOT_URL ||
    !process.env.TASKCLUSTER_CLIENT_ID ||
    !process.env.TASKCLUSTER_ACCESS_TOKEN
  ) {
    console.log([
      'Must provide TASKCLUSTER_ROOT_URL, TASKCLUSTER_CLIENT_ID, and TASKCLUSTER_ACCESS_TOKEN as',
      'environment variables. We recommend using signin from:',
      '',
      'https://github.com/taskcluster/taskcluster/tree/master/clients/client-shell#taskcluster-shell-client',
    ].join('\n'));
    process.exit(1);
  }

  const auth = new taskcluster.Auth(taskcluster.fromEnvVars());
  const res = await auth.currentScopes();
  if (!libScopes.satisfiesExpression(res.scopes, scopeExpression)) {
    const required = libScopes.removeGivenScopes(res.scopes, scopeExpression);
    const message = [
      'The provided Taskcluster credentials are missing the following scopes:',
      '',
      JSON.stringify(required, null, 2),
      '',
      'The credentials must satisfy the following expression:',
      '',
      JSON.stringify(scopeExpression, null, 2),
    ].join('\n');
    console.log(message);
    process.exit(1);
  }

  const target = options.target ? [`target-${options.target}`] : undefined;
  const taskgraph = new TaskGraph(checks, {target});
  await taskgraph.run();
};

module.exports = {main};
