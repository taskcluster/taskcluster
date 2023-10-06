import helper from './helper';
import assume from 'assume';
import testing from 'taskcluster-lib-testing';

suite(testing.suiteName(), function() {
  helper.secrets.mockSuite('expires_test.js', [], function(mock, skipping) {
    helper.withDb(mock, skipping);
    helper.resetTables(mock, skipping);

    test('expire nothing', async function() {
      const count = (await helper.db.fns.expire_last_fires())[0].expire_last_fires;
      assume(count).to.equal(0);
    });
  });
});
