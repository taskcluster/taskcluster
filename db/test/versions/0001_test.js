const helper = require('../helper');
const testing = require('taskcluster-lib-testing');

suite(testing.suiteName(), function() {
  helper.withDbForVersion();

  test('widgets table created', async function() {
    const assertNoWidgets =
      () => helper.withDbClient(async client => {
        await assert.rejects(
          () => client.query('select * from widgets'),
          err => err.code === UNDEFINED_TABLE);
      });

    const assertWidgets =
      () => helper.withDbClient(async client => {
        const res = await client.query('select * from widgets');
        assert.deepEqual(res.rows, []);
      });

    await assertNoWidgets();
    await helper.upgradeTo(1);
    await assertWidgets();
    await helper.downgradeTo(0);
    await assertNoWidgets();
  });
});
