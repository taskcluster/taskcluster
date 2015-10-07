var azure       = require('fast-azure-storage');
var api         = require('./v1');

api.declare({
  method:     'get',
  route:      '/azure/:account/table/:table/read-write',
  name:       'azureTableSAS',
  input:      undefined,
  output:     'azure-table-access-response.json#',
  deferAuth:  true,
  stability:  'stable',
  scopes:     [['auth:azure-table-access:<account>/<table>']],
  title:      "Get Shared-Access-Signature for Azure Table",
  description: [
    "Get a shared access signature (SAS) string for use with a specific Azure",
    "Table Storage table.  Note, this will create the table, if it doesn't",
    "already exist."
  ].join('\n')
}, async function(req, res) {
  // Get parameters
  var account   = req.params.account;
  var tableName = req.params.table;

  // Check that the client is authorized to access given account and table
  if (!req.satisfies({
    account:    account,
    table:      tableName
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
  try {
    await table.createTable(tableName);
  } catch (err) {
    if (err.code !== 'TableAlreadyExists') {
      throw err;
    }
  }

  // Construct SAS
  var expiry = new Date(Date.now() + 25 * 60 * 1000);
  var sas = table.sas(tableName, {
    start:    new Date(Date.now() - 15 * 60 * 1000),
    expiry:   expiry,
    permissions: {
      read:       true,
      add:        true,
      update:     true,
      delete:     true
    }
  });

  // Return the generated SAS
  return res.reply({
    sas:      sas,
    expiry:   expiry.toJSON()
  });
});