import helper from '../helper.js';
import testing from 'taskcluster-lib-testing';

suite(testing.suiteName(), function() {
  helper.withDbForVersion();

  test('widgets table created', async function() {
    await helper.assertNoTable("widgets");
    await helper.upgradeTo(1);
    await helper.assertTable("widgets");
    await helper.downgradeTo(0);
    await helper.assertNoTable("widgets");
  });
});
