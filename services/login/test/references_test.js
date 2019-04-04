const builder = require('../src/api');
const helper = require('./helper');
const References = require('taskcluster-lib-references');
const testing = require('taskcluster-lib-testing');

suite(testing.suiteName(), function() {
  helper.setup();

  test('references validate', async function() {
    const schemaset = await helper.load('schemaset');
    const references = References.fromService({schemaset, builder});
    references.validate();
  });
});
