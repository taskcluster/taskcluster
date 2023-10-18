import { loadChecks } from './checks/index.js';
import taskcluster from 'taskcluster-client';
import libScopes from 'taskcluster-lib-scopes';
import { TaskGraph } from 'console-taskgraph';
import chalk from 'chalk';

const __dirname = new URL('.', import.meta.url).pathname;

export const main = async (options) => {
  if (!process.env.TASKCLUSTER_ROOT_URL ||
    !process.env.TASKCLUSTER_CLIENT_ID ||
    !process.env.TASKCLUSTER_ACCESS_TOKEN
  ) {
    console.log([
      'Must provide TASKCLUSTER_ROOT_URL, TASKCLUSTER_CLIENT_ID, and TASKCLUSTER_ACCESS_TOKEN as',
      'environment variables. We recommend using signin from:',
      '',
      'https://github.com/taskcluster/taskcluster/tree/main/clients/client-shell#taskcluster-shell-client',
    ].join('\n'));
    process.exit(1);
  }

  const { checks, scopeExpression } = await loadChecks(`${__dirname}/checks`);

  const auth = new taskcluster.Auth(taskcluster.fromEnvVars());
  const res = await auth.currentScopes();
  if (!libScopes.satisfiesExpression(res.scopes, scopeExpression)) {
    const required = libScopes.removeGivenScopes(res.scopes, scopeExpression);
    const message = [
      'The provided Taskcluster credentials are missing the following scopes:',
      '',
      JSON.stringify(libScopes.simplifyScopeExpression(required), null, 2),
      '',
      'The credentials must satisfy the following expression:',
      '',
      JSON.stringify(libScopes.simplifyScopeExpression(scopeExpression), null, 2),
    ].join('\n');
    console.log(message);
    process.exit(1);
  }

  const target = options.target ? [`target-${options.target}`] : undefined;
  const taskgraph = new TaskGraph( checks, { target });
  const results = await taskgraph.run();
  if (results['deployment-version']) {
    console.log(chalk`{bold ${process.env.TASKCLUSTER_ROOT_URL} is running Taskcluster version:} {yellow ${results['deployment-version']}}`);
  }
};
