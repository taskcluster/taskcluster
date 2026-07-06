import testing from '@taskcluster/lib-testing';
import helper from '../helper.js';
import { strict as assert } from 'node:assert';

suite(testing.suiteName(), () => {
  helper.withDbForProcs({ serviceName: 'hooks' });

  helper.dbTest('search_hooks function exists and returns table', async db => {
    const rows = await db.fns.search_hooks('', null, 100, 0);
    assert.equal(rows.length, 0);
  });
});
