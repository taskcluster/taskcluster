const AWS = require('aws-sdk');
const {backupTasks} = require('./backup');
const {restoreTasks} = require('./restore');
const {compareTasks} = require('./compare');
const {TaskGraph, Lock} = require('console-taskgraph');

const main = async ({operation, ...options}) => {
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

  requireEnv('AWS_ACCESS_KEY_ID');
  const s3 = new AWS.S3({});
  const bucket = requireEnv('BACKUP_BUCKET');

  let tasks;
  if (operation === 'backup') {
    tasks = await backupTasks({azureCreds, s3, bucket, ...options});
  } else if (operation === 'restore') {
    tasks = await restoreTasks({azureCreds, s3, bucket, ...options});
  } else if (operation === 'compare') {
    tasks = await compareTasks({azureCreds, ...options});
  } else {
    throw new Error('unknown operation');
  }

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

module.exports = {
  backup: options => main({operation: 'backup', ...options}),
  restore: options => main({operation: 'restore', ...options}),
  compare: options => main({operation: 'compare', ...options}),
};
