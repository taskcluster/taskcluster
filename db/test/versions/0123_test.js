import testing from '@taskcluster/lib-testing';
import helper from '../helper.js';
import { strict as assert } from 'assert';

suite(testing.suiteName(), function() {
  helper.withDbForProcs({ serviceName: 'hooks' });

  helper.dbTest('search_hooks function exists and returns table', async function(db) {
    const rows = await db.fns.search_hooks('', 100, 0);
    assert.equal(rows.length, 0);
  });
});
