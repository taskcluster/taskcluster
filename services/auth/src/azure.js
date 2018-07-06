const _ = require('lodash');
const azure = require('fast-azure-storage');
const builder = require('./v1');

// keyed by account/tableName, the last time createTable was called for the
// given table.  This is used to avoid lots of redundant calls to createTable
// for the same table.
const tableLastCreated = {};
// Similar for containers
const containerLastCreated = {};

builder.declare({
  method:     'get',
  route:      '/azure/accounts',
  name:       'azureAccounts',
  input:      undefined,
  output:     'azure-account-list-response.yml',
  stability:  'stable',
  scopes:     'auth:azure-table:list-accounts',
  title:      'List Accounts Managed by Auth',
  description: [
    'Retrieve a list of all Azure accounts managed by Taskcluster Auth.',
  ].join('\n'),
}, function(req, res) {
  return res.reply({accounts: _.keys(this.azureAccounts)});
});

builder.declare({
  method:     'get',
  route:      '/azure/:account/tables',
  name:       'azureTables',
  query: {
    continuationToken: /^[A-Za-z][A-Za-z0-9]{2,62}$/,
  },
  input:      undefined,
  output:     'azure-table-list-response.yml',
  stability:  'stable',
  scopes:     'auth:azure-table:list-tables:<account>',
  title:      'List Tables in an Account Managed by Auth',
  description: [
    'Retrieve a list of all tables in an account.',
  ].join('\n'),
}, async function(req, res) {
  let account = req.params.account;
  let continuationToken  = req.query.continuationToken || null;

  await req.authorize({account});

  let table = new azure.Table({
    accountId:  account,
    accessKey:  this.azureAccounts[account],
  });

  let result = await table.queryTables({continuationToken});
  let data = {tables: result.tables};
  if (result.nextTableName) {
    data.continuationToken = result.nextTableName;
  }
  return res.reply(data);
});

builder.declare({
  method:     'get',
  route:      '/azure/:account/table/:table/:level',
  name:       'azureTableSAS',
  input:      undefined,
  output:     'azure-table-access-response.yml',
  stability:  'stable',
  scopes: {
    if: 'levelIsReadOnly',
    then: {AnyOf: [
      'auth:azure-table:read-only:<account>/<table>',
      'auth:azure-table:read-write:<account>/<table>',
    ]},
    else: 'auth:azure-table:read-write:<account>/<table>',
  },
  title:      'Get Shared-Access-Signature for Azure Table',
  description: [
    'Get a shared access signature (SAS) string for use with a specific Azure',
    'Table Storage table.',
    '',
    'The `level` parameter can be `read-write` or `read-only` and determines',
    'which type of credentials are returned.  If level is read-write, it will create the',
    'table if it doesn\'t already exist.',
  ].join('\n'),
}, async function(req, res) {
  let account   = req.params.account;
  let tableName = req.params.table;
  let level     = req.params.level;

  // We have a complicated scope situation for read-only since we want
  // read-write to grant read-only permissions as well
  await req.authorize({
    account,
    table: tableName,
    level,
    levelIsReadOnly: level == 'read-only',
  });

  // Check that the account exists
  if (!this.azureAccounts[account]) {
    return res.reportError('ResourceNotFound',
      `Account '${account}' not found, can't delegate access`);
  }

  // Construct client
  let table = new azure.Table({
    accountId:  account,
    accessKey:  this.azureAccounts[account],
  });

  // Create table, ignore error, if it already exists
  if (level === 'read-write') {
    // only try to create if we haven't done so in this process recently
    const key = `${account}/${tableName}`;
    if (!tableLastCreated[key] || new Date() - tableLastCreated[key] > 6 * 3600 * 1000) {
      try {
        await table.createTable(tableName);
      } catch (err) {
        if (err.code !== 'TableAlreadyExists') {
          throw err;
        }
      }
      tableLastCreated[key] = new Date();
    }
  }

  let perm = level === 'read-write';

  // Construct SAS
  let expiry = new Date(Date.now() + 25 * 60 * 1000);
  let sas = table.sas(tableName, {
    start:    new Date(Date.now() - 15 * 60 * 1000),
    expiry:   expiry,
    permissions: {
      read:       true,
      add:        perm,
      update:     perm,
      delete:     perm,
    },
  });

  // Return the generated SAS
  return res.reply({
    sas:      sas,
    expiry:   expiry.toJSON(),
  });
});

builder.declare({
  method:     'get',
  route:      '/azure/:account/containers',
  name:       'azureContainers',
  query: {
    continuationToken: /^[A-Za-z][A-Za-z0-9]{2,62}$/,
  },
  input:      undefined,
  output:     'azure-container-list-response.yml',
  stability:  'stable',
  scopes:     'auth:azure-container:list-containers:<account>',
  title:      'List containers in an Account Managed by Auth',
  description: [
    'Retrieve a list of all containers in an account.',
  ].join('\n'),
}, async function(req, res) {
  let account = req.params.account;
  let continuationToken  = req.query.continuationToken || null;

  let blob = new azure.Blob({
    accountId:  account,
    accessKey:  this.azureAccounts[account],
  });

  let result = await blob.listContainers({marker: continuationToken});
  let data = {containers: result.containers.map(c => c.name)};
  if (result.nextMarker) {
    data.continuationToken = result.nextMarker;
  }
  return res.reply(data);
});

builder.declare({
  method:     'get',
  route:      '/azure/:account/containers/:container/:level',
  name:       'azureContainerSAS',
  input:      undefined,
  output:     'azure-container-response.yml',
  stability:  'stable',
  scopes: {
    if: 'levelIsReadOnly',
    then: {AnyOf: [
      'auth:azure-container:read-only:<account>/<container>',
      'auth:azure-container:read-write:<account>/<container>',
    ]},
    else: 'auth:azure-container:read-write:<account>/<container>',
  },
  title:      'Get Shared-Access-Signature for Azure Container',
  description: [
    'Get a shared access signature (SAS) string for use with a specific Azure',
    'Blob Storage container.',
    '',
    'The `level` parameter can be `read-write` or `read-only` and determines',
    'which type of credentials are returned.  If level is read-write, it will create the',
    'container if it doesn\'t already exist.',
  ].join('\n'),
}, async function(req, res) {
  // Get parameters
  let account = req.params.account;
  let container = req.params.container;
  let level = req.params.level;

  // Check that the client is authorized to access given account and container
  await req.authorize({level, account, container, levelIsReadOnly: level === 'read-only'});

  // Check that the account exists
  if (!this.azureAccounts[account]) {
    return res.reportError('ResourceNotFound',
      `Account '${level}' not found, can't delegate access.`);
  }

  // Construct client
  let blob = new azure.Blob({
    accountId:  account,
    accessKey:  this.azureAccounts[account],
  });

  // Create container ignore error, if it already exists
  if (level === 'read-write') {
    const key = `${account}/${container}`;
    if (!containerLastCreated[key] || new Date() - containerLastCreated[key] > 6 * 3600 * 1000) {
      try {
        await blob.createContainer(container);
      } catch (err) {
        if (err.code !== 'ContainerAlreadyExists') {
          throw err;
        }
      }
      containerLastCreated[key] = new Date();
    }
  }

  let perm = level === 'read-write';

  // Construct SAS
  let expiry = new Date(Date.now() + 25 * 60 * 1000);
  let sas = blob.sas(container, null, {
    start:         new Date(Date.now() - 15 * 60 * 1000),
    expiry:        expiry,
    resourceType: 'container',
    permissions: {
      read:       true,
      add:        perm,
      create:     perm,
      write:      perm,
      delete:     perm,
      list:       true,
    },
  });

  // Return the generated SAS
  return res.reply({
    sas:      sas,
    expiry:   expiry.toJSON(),
  });
});
