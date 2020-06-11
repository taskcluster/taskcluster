const {schema} = require('./schema.js');
const {Database, Keyring} = require('taskcluster-lib-postgres');
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

exports.fakeSetup = async ({serviceName, azureCryptoKey, cryptoKeys}) => {
  const keyring = new Keyring({azureCryptoKey, cryptoKeys});
  return new FakeDatabase({
    schema: schema({useDbDirectory: true}),
    serviceName,
    keyring,
  });
};
