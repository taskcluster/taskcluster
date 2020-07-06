const {schema} = require('./schema.js');
const {Database} = require('taskcluster-lib-postgres');

exports.setup = async ({writeDbUrl, readDbUrl, serviceName, useDbDirectory,
  statementTimeout, poolSize, monitor, azureCryptoKey, dbCryptoKeys}) => {
  return await Database.setup({
    schema: schema({useDbDirectory}),
    writeDbUrl,
    readDbUrl,
    serviceName,
    statementTimeout,
    poolSize,
    monitor,
    azureCryptoKey,
    dbCryptoKeys,
  });
};
