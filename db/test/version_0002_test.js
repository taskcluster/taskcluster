const assert = require('assert').strict;
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');

suite(testing.suiteName(), function() {
  helper.withDb();

  test('expires column added to table', async function() {
    await helper.upgradeTo(1);

    await helper.withDbClient(async client => {
      await client.query(`
        insert into secrets(name, secret)
          values('my-secret', 'hunter2')
      `);
    });

    await helper.upgradeTo(2);

    await helper.withDbClient(async client => {
      const res = await client.query(`
        select name, secret, expires from secrets
      `);
      assert.equal(res.rows.length, 1);
      assert.equal(res.rows[0].name, "my-secret");
      assert.equal(res.rows[0].secret, "hunter2");
      assert(res.rows[0].expires > new Date(3019, 1, 1));
    });
  });
});
