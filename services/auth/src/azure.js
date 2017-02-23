var _           = require('lodash');
var azure       = require('fast-azure-storage');
var api         = require('./v1');

api.declare({
  method:     'get',
  route:      '/azure/accounts',
  name:       'azureAccounts',
  input:      undefined,
  output:     'azure-account-list-response.json#',
  stability:  'stable',
  scopes:     [['auth:azure-table:list-accounts']],
  title:      "List Accounts Managed by Auth",
  description: [
    "Retrieve a list of all Azure accounts managed by Taskcluster Auth.",
  ].join('\n')
}, function(req, res) {
  return res.reply({accounts: _.keys(this.azureAccounts)});
});

api.declare({
  method:     'get',
  route:      '/azure/:account/tables',
  name:       'azureTables',
  query: {
    continuationToken: /^[A-Za-z][A-Za-z0-9]{2,62}$/,
  },
  input:      undefined,
  output:     'azure-table-list-response.json#',
  stability:  'stable',
  scopes:     [['auth:azure-table:list-tables:<account>']],
  title:      "List Tables in an Account Managed by Auth",
  description: [
    "Retrieve a list of all tables in an account.",
  ].join('\n')
}, async function(req, res) {
  let account = req.params.account;
  let continuationToken  = req.query.continuationToken || null;

  if (!req.satisfies({account})) { return; }

  let table = new azure.Table({
    accountId:  account,
    accessKey:  this.azureAccounts[account]
  });

  let result = await table.queryTables({continuationToken});
  let data = {tables: result.tables};
  if (result.nextTableName) {
      data.continuationToken = result.nextTableName;
  }
  return res.reply(data);
});

api.declare({
  method:     'get',
  route:      '/azure/:account/table/:table/:level',
  name:       'azureTableSAS',
  input:      undefined,
  output:     'azure-table-access-response.json#',
  deferAuth:  true,
  stability:  'stable',
  scopes:     [['auth:azure-table:<level>:<account>/<table>']],
  title:      "Get Shared-Access-Signature for Azure Table",
  description: [
    "Get a shared access signature (SAS) string for use with a specific Azure",
    "Table Storage table. By not specifying a level as in azureTableSASLevel,",
    "you will get read-write permissions. If you get read-write from this, it will create the",
    "table if it doesn't already exist.",
  ].join('\n')
}, async function(req, res) {
  var account   = req.params.account;
  var tableName = req.params.table;
  var level     = req.params.level;

  if (!['read-write', 'read-only'].includes(level)) {
    return res.status(404).json({
      message:    "Level '" + level + "' is not valid. Must be one of ['read-write', 'read-only']."
    });
  }

  // We have a complicated scope situation for read-only since we want
  // read-write to grant read-only permissions as well
  if (!(level === 'read-only' && req.satisfies({account, table: tableName, level: 'read-write'}, true)) &&
    !req.satisfies({account, table: tableName, level})) {
    return;
  }

  // Check that the account exists
  if (!this.azureAccounts[account]) {
    return res.status(404).json({
      message:    "Account '" + account + "' not found, can't delegate access"
    });
  }

  // Construct client
  var table = new azure.Table({
    accountId:  account,
    accessKey:  this.azureAccounts[account]
  });

  // Create table ignore error, if it already exists
  if (level === 'read-write') {
    try {
      await table.createTable(tableName);
    } catch (err) {
      if (err.code !== 'TableAlreadyExists') {
        throw err;
      }
    }
  }

  let perm = level === 'read-write';

  // Construct SAS
  var expiry = new Date(Date.now() + 25 * 60 * 1000);
  var sas = table.sas(tableName, {
    start:    new Date(Date.now() - 15 * 60 * 1000),
    expiry:   expiry,
    permissions: {
      read:       true,
      add:        perm,
      update:     perm,
      delete:     perm,
    }
  });

  // Return the generated SAS
  return res.reply({
    sas:      sas,
    expiry:   expiry.toJSON()
  });
});
