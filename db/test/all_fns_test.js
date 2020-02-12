const assert = require('assert').strict;
const tcdb = require('taskcluster-db');
const testing = require('taskcluster-lib-testing');
const {FakeDatabase} = require('../src/fakes');

suite(testing.suiteName(), function() {
  test('Set of real functions matches the set of fake functions', function() {
    const schema = tcdb.schema({useDbDirectory: true});
    const dbMethods = schema.allMethods().map(({name}) => name).sort();

    const fakeDb = new FakeDatabase({schema, serviceName: 'test'});
    const fakeMethods = Object.keys(fakeDb.fns).sort();

    // If this fails, probably someone somewhere added a stored function in a
    // DB version and did not a fake version.
    assert.deepEqual(dbMethods, fakeMethods);
  });
});
