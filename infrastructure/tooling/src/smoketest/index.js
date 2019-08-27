const checks = require('./checks');
const {TaskGraph} = require('console-taskgraph');

const main = async (options) => {
  if (!process.env.TASKCLUSTER_ROOT_URL ||
    !process.env.TASKCLUSTER_CLIENT_ID ||
    !process.env.TASKCLUSTER_ACCESS_TOKEN
  ) {
    console.log(`
    Must provide TASKCLUSTER_ROOT_URL, TASKCLUSTER_CLIENT_ID, and TASKCLUSTER_ACCESS_TOKEN as
    environment variables. We recommend using signin from:

    https://github.com/taskcluster/taskcluster/tree/master/clients/client-shell#taskcluster-shell-client

    `);
    process.exit(1);
  }
  const target = options.target ? [`target-${options.target}`] : undefined;
  const taskgraph = new TaskGraph(checks, {target});
  await taskgraph.run();
};

module.exports = {main};
