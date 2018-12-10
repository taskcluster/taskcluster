const builder = require('../src/v1');
const helper = require('./helper');
const References = require('taskcluster-lib-references');

suite('references_test.js', function() {
  helper.setup();

  test('references validate', async function() {
    const schemaset = await helper.load('schemaset');
    const references = References.fromService({schemaset, builder});
    references.validate();
  });
});
