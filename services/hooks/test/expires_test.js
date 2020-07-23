const helper = require('./helper');
const assume = require('assume');
const testing = require('taskcluster-lib-testing');

suite(testing.suiteName(), function() {
  helper.secrets.mockSuite('expires_test.js', [], function(mock, skipping) {
    helper.withDb(mock, skipping);
    helper.withEntities(mock, skipping);
    helper.resetTables(mock, skipping);

    test('expire nothing', async function() {
      const count = (await helper.db.fns.expire_last_fires())[0].expire_last_fires;
      assume(count).to.equal(0);
    });
  });
});
