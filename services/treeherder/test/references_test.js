const exchanges = require('../src/exchanges');
const helper = require('./helper');
const monitorManager = require('../src/monitor');
const References = require('taskcluster-lib-references');
const testing = require('taskcluster-lib-testing');

suite(testing.suiteName(), function() {
  test('references validate', async function() {
    const schemaset = await helper.load('schemaset');
    const references = References.fromService({
      schemaset,
      references: [
        exchanges.reference(),
        monitorManager.reference(),
      ],
    });
    references.validate();
  });
});
