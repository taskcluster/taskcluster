import helper from './helper.js';
import assume from 'assume';
import testing from '@taskcluster/lib-testing';

suite(testing.suiteName(), () => {
  helper.secrets.mockSuite('expires_test.js', [], (mock, skipping) => {
    helper.withDb(mock, skipping);
    helper.resetTables();

    test('expire nothing', async () => {
      const count = (await helper.db.fns.expire_last_fires())[0].expire_last_fires;
      assume(count).to.equal(0);
    });
  });
});
