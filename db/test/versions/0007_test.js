const assert = require('assert').strict;
const path = require('path');
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');
const {postgresTableName} = require('taskcluster-lib-entities');
const tcdb = require('taskcluster-db');
const {Schema} = require('taskcluster-lib-postgres');

suite(testing.suiteName(), function() {
  helper.withDbForVersion();

  test('stored function bodies match those in tc-lib-entities tests', function() {
    // This is a meta-check to ensure that the tests in tc-lib-entities, which
    // use a private copy of the stored functions, are testing the exact same
    // thing as we are using in version 0002.
    const testSchema = Schema.fromDbDirectory(path.join(__dirname, '../../../libraries/entities/test/db'));
    const testVersion = testSchema.getVersion(1);

    const realSchema = tcdb.schema({useDbDirectory: true});
    const realVersion2 = realSchema.getVersion(2);
    const realVersion7 = realSchema.getVersion(7);
    for (let azureTableName of helper.azureTableNames) {
      for (let methodSuffix of ['load', 'create', 'remove', 'modify', 'scan']) {
        const method = `${postgresTableName(azureTableName)}_${methodSuffix}`;

        const realVersion = methodSuffix === 'scan' ? realVersion7 : realVersion2;
        const realMethod = realVersion.methods[method].body;
        assert(realMethod, `Method ${method} not defined`);

        const testMethod = testVersion.methods[`test_entities_${methodSuffix}`].body;
        assert.equal(testMethod.replace(/test_entities/g, postgresTableName(azureTableName)), realMethod);
      }
    }
  });
});
