import _ from 'lodash';
import { strict as assert } from 'assert';
import helper from '../helper.js';
import testing from '@taskcluster/lib-testing';

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(import.meta.url)[1]);

suite(testing.suiteName(), function() {
  helper.withDbForVersion();

  const expires = new Date();
  helper.dbVersionTest({
    version: THIS_VERSION,
    onlineMigration: false,
    onlineDowngrade: false,
    createData: async client => {
      await client.query(`
        insert into objects (name, project_id, backend_id, data, expires)
        values ('public/foo', 'p', 'b', '{}', $1)`, [expires]);
    },
    startCheck: async client => {
      await helper.assertNoTableColumn('objects', 'upload_id');
      await helper.assertNoTableColumn('objects', 'upload_expires');
    },
    concurrentCheck: async client => {
      const { rows } = await client.query('select * from objects');
      assert.equal(rows.length, 1);
      assert.equal(rows[0].name, 'public/foo');
      assert.equal(rows[0].project_id, 'p');
      assert.equal(rows[0].backend_id, 'b');
      assert.deepEqual(rows[0].data, {});
      assert.equal(rows[0].expires.toJSON(), expires.toJSON());
    },
    finishedCheck: async client => {
      await helper.assertTableColumn('objects', 'upload_id');
      await helper.assertTableColumn('objects', 'upload_expires');
    },
  });
});
