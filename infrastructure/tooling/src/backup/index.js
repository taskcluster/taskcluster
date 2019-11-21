const AWS = require('aws-sdk');
const glob = require('glob');
const {REPO_ROOT, readRepoYAML} = require('../utils');
const {backupTable} = require('./backup');
const {TaskGraph, Lock} = require('console-taskgraph');

const backup = async (options) => {
  const containers = [];
  const tables = [];
  for (let path of glob.sync('services/*/azure.yml', {cwd: REPO_ROOT})) {
    const azureYml = await await readRepoYAML(path);
    for (let c of azureYml.containers || []) {
      containers.push(c);
    }
    for (let t of azureYml.tables || []) {
      tables.push(t);
    }
  }

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

  const tasks = [];
  const concurrency = new Lock(3);

  for (let tableName of tables) {
    tasks.push({
      title: `Back up Table ${tableName}`,
      locks: ['concurrency'],
      requires: [],
      provides: [],
      run: async (requirements, utils) => {
        await backupTable({azureCreds, s3, bucket, tableName, utils});
      },
    });
  }

  for (let containerName of containers) {
    tasks.push({
      title: `Back up Container ${containerName}`,
      locks: ['concurrency'],
      requires: [],
      provides: [],
      run: async (requirements, utils) => {
        await backupTable({azureCreds, s3, bucket, containerName, utils});
      },
    });
  }

  const taskgraph = new TaskGraph(tasks, {
    locks: {concurrency},
  });
  await taskgraph.run();
};

module.exports = {backup};
