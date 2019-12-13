const {Schema, Database} = require('taskcluster-lib-postgres');
const {FakeDatabase} = require('./fakes');

module.exports.setup = async ({writeDbUrl, readDbUrl, serviceName}) => {
  return await Database.setup({
    schema: Schema.fromDbDirectory(),
    writeDbUrl,
    readDbUrl,
    serviceName,
  });
};

module.exports.fakeSetup = async ({serviceName}) => {
  return new FakeDatabase({
    schema: Schema.fromDbDirectory(),
    serviceName,
  });
};
