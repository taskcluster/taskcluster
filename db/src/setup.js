const {schema} = require('./schema.js');
const {Database} = require('taskcluster-lib-postgres');
const {FakeDatabase} = require('./fakes');

exports.setup = async ({writeDbUrl, readDbUrl, serviceName, useDbDirectory}) => {
  return await Database.setup({
    schema: schema({useDbDirectory}),
    writeDbUrl,
    readDbUrl,
    serviceName,
  });
};

exports.fakeSetup = async ({serviceName}) => {
  return new FakeDatabase({
    schema: schema({useDbDirectory: true}),
    serviceName,
  });
};
