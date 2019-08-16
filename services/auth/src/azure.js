const _ = require('lodash');
const azure = require('fast-azure-storage');
const builder = require('./api');

// keyed by account/tableName, the last time createTable was called for the
// given table.  This is used to avoid lots of redundant calls to createTable
// for the same table.
const tableLastCreated = {};
// Similar for containers
const containerLastCreated = {};

builder.declare({
  method: 'get',
  route: '/azure/accounts',
  name: 'azureAccounts',
  input: undefined,
  output: 'azure-account-list-response.yml',
  stability: 'stable',
  category: 'Auth Service',
  scopes: 'auth:azure-table:list-accounts',
  title: 'List Accounts Managed by Auth',
  description: [
    'Retrieve a list of all Azure accounts managed by Taskcluster Auth.',
  ].join('\n'),
}, function(req, res) {
  return res.reply({accounts: _.keys(this.azureAccounts)});
});

builder.declare({
  method: 'get',
  route: '/azure/:account/tables',
  name: 'azureTables',
  query: {
    continuationToken: /^.*$/,
  },
  input: undefined,
  category: 'Auth Service',
  output: 'azure-table-list-response.yml',
  stability: 'stable',
  scopes: 'auth:azure-table:list-tables:<account>',
  title: 'List Tables in an Account Managed by Auth',
  description: [
    'Retrieve a list of all tables in an account.',
  ].join('\n'),
}, async function(req, res) {
  let account = req.params.account;
  let continuationToken = req.query.continuationToken || null;

  let table = new azure.Table({
    accountId: account,
    accessKey: this.azureAccounts[account],
  });

  let result = await table.queryTables({nextTableName: continuationToken});
  let data = {tables: result.tables};
  if (result.nextTableName) {
    data.continuationToken = result.nextTableName;
  }
  return res.reply(data);
});

builder.declare({
  method: 'get',
  route: '/azure/:account/containers',
  name: 'azureContainers',
  query: {
    continuationToken: /.*/,
  },
  input: undefined,
  output: 'azure-container-list-response.yml',
  stability: 'stable',
  category: 'Auth Service',
  scopes: 'auth:azure-container:list-containers:<account>',
  title: 'List containers in an Account Managed by Auth',
  description: [
    'Retrieve a list of all containers in an account.',
  ].join('\n'),
}, async function(req, res) {
  let account = req.params.account;
  let continuationToken = req.query.continuationToken || null;

  let blob = new azure.Blob({
    accountId: account,
    accessKey: this.azureAccounts[account],
  });

  let result = await blob.listContainers({marker: continuationToken});
  let data = {containers: result.containers.map(c => c.name)};
  if (result.nextMarker) {
    data.continuationToken = result.nextMarker;
  }
  return res.reply(data);
});

