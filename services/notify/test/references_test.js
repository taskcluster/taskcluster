const builder = require('../src/api');
const exchanges = require('../src/exchanges');
const monitorManager = require('../src/monitor');
const helper = require('./helper');
const References = require('taskcluster-lib-references');
const testing = require('taskcluster-lib-testing');

suite(testing.suiteName(), function() {
  test('references validate', async function() {
    const schemaset = await helper.load('schemaset');
    const references = References.fromService({schemaset, builder, exchanges, monitorManager});
    references.validate();
  });
});
