const {schema} = require('./schema.js');
const {Database} = require('taskcluster-lib-postgres');
const {FakeDatabase} = require('./fakes');

exports.setup = async ({writeDbUrl, readDbUrl, serviceName, useDbDirectory,
  statementTimeout, poolSize, monitor, azureCryptoKey, cryptoKeys}) => {
  return await Database.setup({
    schema: schema({useDbDirectory}),
    writeDbUrl,
    readDbUrl,
    serviceName,
    statementTimeout,
    poolSize,
    monitor,
    azureCryptoKey,
    cryptoKeys,
  });
};

exports.fakeSetup = async ({serviceName}) => {
  return new FakeDatabase({
    schema: schema({useDbDirectory: true}),
    serviceName,
  });
};
