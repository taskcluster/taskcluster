const {TaskGraph, Lock} = require('console-taskgraph');
const { Database } = require('taskcluster-lib-postgres');
const importer = require('./importer');
const verifier = require('./verifier');
const { requireEnv } = require('./util');

const main = async ({ operation }) => {
  const credentials = {
    azure: {
      accountId: requireEnv('AZURE_ACCOUNT'),
      accessKey: requireEnv('AZURE_ACCOUNT_KEY'),
    },
    postgres: {
      adminDbUrl: requireEnv('ADMIN_DB_URL'),
    },
  };
  const db = new Database({ urlsByMode: {admin: credentials.postgres.adminDbUrl}, statementTimeout: false });

  let tasks;
  if (operation === 'importer') {
    tasks = await importer({ credentials, db });
  } else if (operation === 'verifier') {
    tasks = await verifier({ credentials, db });
  } else {
    throw new Error('unknown operation');
  }

  const taskgraph = new TaskGraph(tasks, {
    locks: {
      concurrency: new Lock(3),
    },
  });
  const context = await taskgraph.run();
  await db.close();

  if (context['metadata']) {
    console.log(context.metadata);
  }
};

module.exports = {
  importer: () => main({operation: 'importer' }),
  verifier: () => main({operation: 'verifier' }),
};
