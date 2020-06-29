const _ = require('lodash');
const assert = require('assert').strict;
const tcdb = require('taskcluster-db');
const testing = require('taskcluster-lib-testing');
const {FakeDatabase} = require('../src/fakes');

suite(testing.suiteName(), function() {
  test('Set of real functions matches the set of fake functions', function() {
    const schema = tcdb.schema({useDbDirectory: true});
    const allMethods = schema.allMethods();
    let [dbMethods, deprecatedDbMethods] = _.partition(allMethods, {'deprecated': false});
    dbMethods = dbMethods.map(({name}) => name).sort();
    deprecatedDbMethods = deprecatedDbMethods.map(({name}) => name).sort();

    const fakeDb = new FakeDatabase({schema, serviceName: 'test'});
    const fakeMethods = Object.keys(fakeDb.fns).sort();
    const deprecatedFakeMethods = Object.keys(fakeDb.deprecatedFns).sort();

    // If this fails, probably someone somewhere added a stored function in a
    // DB version and did not add a fake version.
    assert.deepEqual(dbMethods, fakeMethods);
    assert.deepEqual(deprecatedDbMethods, deprecatedFakeMethods);
  });
});
