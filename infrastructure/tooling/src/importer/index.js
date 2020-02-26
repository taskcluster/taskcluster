const {TaskGraph, Lock} = require('console-taskgraph');
const { Database } = require('taskcluster-lib-postgres');
const importer = require('./importer');

const main = async () => {
  // Gather credentials
  const requireEnv = name => {
    if (process.env[name]) {
      return process.env[name];
    }
    throw new Error(`$${name} must be given`);
  };

  const azureCreds = {
    accountId: requireEnv('AZURE_ACCOUNT'),
    accessKey: requireEnv('AZURE_ACCOUNT_KEY'),
  };
  const postgresCreds = {
    adminDbUrl: requireEnv('ADMIN_DB_URL'),
  };
  const db = new Database({ urlsByMode: {admin: postgresCreds.adminDbUrl}, statementTimeout: 30 });
  const tasks = await importer({
    credentials: {
      azure: azureCreds,
      postgres: postgresCreds,
    },
    db,
  });

  const taskgraph = new TaskGraph(tasks, {
    locks: {
      concurrency: new Lock(3),
    },
  });
  const context = await taskgraph.run();
  await db.close();

  if (context['output']) {
    console.log(context.output);
  }
};

module.exports = () => main();
