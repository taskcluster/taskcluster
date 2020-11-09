const { fromNow } = require('taskcluster-client');
const assert = require('assert').strict;
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');

suite(testing.suiteName(), function() {
  helper.withDbForProcs({ serviceName: 'object' });

  setup('truncate tables', async function() {
    await helper.withDbClient(async client => {
      await client.query('truncate objects');
    });
  });

  suite(`${testing.suiteName()} - objects`, function() {
    helper.dbTest('create_object', async function(db, isFake) {
      const expires = fromNow('1 year');
      await db.fns.create_object('foo', { projectId: 'projectId' }, expires);

      await helper.withDbClient(async client => {
        const { rows } = await client.query('select name, data, expires from objects');
        assert.equal(rows.length, 1);
        assert.equal(rows[0].name, 'foo');
        assert.deepEqual(rows[0].data, { projectId: 'projectId' });
        assert.equal(JSON.stringify(rows[0].expires), JSON.stringify(expires));
      });
    });
    helper.dbTest('get_object', async function(db, isFake) {
      const expires = fromNow('1 year');
      await db.fns.create_object('foo', { projectId: 'projectId' }, expires);
      const rows = await db.fns.get_object('foo');

      assert.equal(rows.length, 1);
      assert.deepEqual(rows[0].name, 'foo');
      assert.deepEqual(rows[0].data, { projectId: 'projectId' });
      assert.equal(JSON.stringify(rows[0].expires), JSON.stringify(expires));
    });
    helper.dbTest('expire_objects', async function(db) {
      const samples = [
        {
          name: 'object-1',
          data: { foo: 'bar' },
          expires: fromNow('1 day'),
        },
        {
          name: 'object-2',
          data: { bar: 'baz' },
          expires: fromNow('-1 day'),
        },
      ];

      await helper.withDbClient(async client => {
        for (let s of samples) {
          await client.query(`
              insert into objects (name, data, expires)
              values ($1, $2, $3)`, [s.name, s.data, s.expires]);
        }
      });

      const count = (await db.fns.expire_objects())[0].expire_objects;

      assert.equal(count, 1);

      await helper.withDbClient(async client => {
        const res = await client.query(`select name from objects`);
        assert(res.rows.length, 1);
      });
    });
  });
});
