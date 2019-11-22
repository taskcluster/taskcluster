const AWS = require('aws-sdk');
const glob = require('glob');
const {REPO_ROOT, readRepoYAML} = require('../utils');
const {backupTable} = require('./backup');
const {TaskGraph, Lock} = require('console-taskgraph');

const fail = msg => {
  console.error(msg);
  process.exit(1);
};

const backup = async ({include, exclude}) => {
  let containers = [];
  let tables = [];
  for (let path of glob.sync('services/*/azure.yml', {cwd: REPO_ROOT})) {
    const azureYml = await await readRepoYAML(path);
    for (let c of azureYml.containers || []) {
      containers.push(c);
    }
    for (let t of azureYml.tables || []) {
      tables.push(t);
    }
  }

  if (include.length > 0 && exclude.length > 0) {
    return fail('Cannot both --include and --exclude');
  }

  if (include.length > 0) {
    const existingTables = new Set(tables);
    const existingContainers = new Set(containers);
    tables = [];
    containers = [];

    for (let rsrc of include) {
      const match = /([^\/]*)\/(.*)/.exec(rsrc);
      if (!match) {
        return fail(`Invalid resource name ${rsrc}`);
      }
      const type = match[1];
      const name = match[2];

      if (type === 'table') {
        if (existingTables.has(name)) {
          tables.push(name);
        } else {
          return fail(`No such table ${name}`);
        }
      } else if (type === 'container') {
        if (existingContainers.has(name)) {
          containers.push(name);
        } else {
          return fail(`No such container ${name}`);
        }
      } else {
        return fail(`Unknown resource type ${type}`);
      }
    }
  }

  if (exclude.length > 0) {
    const excludeSet = new Set(exclude);
    tables = tables.filter(t => !excludeSet.has(`table/${t}`));
    containers = containers.filter(c => !excludeSet.has(`container/${c}`));
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
