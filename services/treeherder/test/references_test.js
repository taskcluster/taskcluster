const exchanges = require('../src/exchanges');
const helper = require('./helper');
const References = require('taskcluster-lib-references');

suite('references_test.js', function() {
  test('references validate', async function() {
    const schemaset = await helper.load('schemaset');
    const references = References.fromService({schemaset, exchanges});
    references.validate();
  });
});
