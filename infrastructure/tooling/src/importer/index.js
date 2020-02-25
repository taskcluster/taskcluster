const {TaskGraph, Lock} = require('console-taskgraph');
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
    readDbUrl: requireEnv('READ_DB_URL'),
    writeDbUrl: requireEnv('WRITE_DB_URL'),
  };
  const tasks = await importer({
    credentials: {
      azure: azureCreds,
      postgres: postgresCreds,
    },
  });

  const taskgraph = new TaskGraph(tasks, {
    locks: {
      concurrency: new Lock(3),
    },
  });
  const context = await taskgraph.run();

  if (context['output']) {
    console.log(context.output);
  }
};

module.exports = () => main();
