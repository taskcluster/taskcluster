import helper from './helper.js';
import assume from 'assume';
import testing from 'taskcluster-lib-testing';

suite(testing.suiteName(), function() {
  helper.secrets.mockSuite('expires_test.js', [], function(mock, skipping) {
    const dbHelper = helper.withDb(mock, skipping);
    helper.resetTables(mock, skipping);

    test('expire nothing', async function() {
      const count = (await dbHelper.db.fns.expire_last_fires())[0].expire_last_fires;
      assume(count).to.equal(0);
    });
  });
});
