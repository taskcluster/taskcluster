var azure       = require('fast-azure-storage');
var api         = require('./v1');

api.declare({
  method:     'get',
  route:      '/azure/:account/table/:table/:level',
  name:       'azureTableSAS',
  input:      undefined,
  output:     'azure-table-access-response.json#',
  deferAuth:  true,
  stability:  'stable',
  scopes:     [['auth:azure-table-access:<account>/<table>'], ['auth:azure-table-access:<account>/<table>/<level>']],
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
  var level     = req.params.level || 'read-write';

  if (!['read-write', 'read-only'].includes(level)) {
    return res.status(404).json({
      message:    "Level '" + level + "' is not valid. Must be one of ['read-write', 'read-only']."
    });
  }

  // Check that the client is authorized to access given account and table
  if (!req.satisfies({
    account:    account,
    table:      tableName,
    level:      level,
  })) {
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
