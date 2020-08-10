const _ = require('lodash');
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');
const hugeBufs = require('./fixtures/huge_bufs.js');
const { entityBufDecodeTest } = require('./0008_test.js');

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(__filename)[1]);
const PREV_VERSION = THIS_VERSION - 1;

suite(testing.suiteName(), function() {
  helper.withDbForVersion();

  // note that this test suite initially tested the migration much more thoroughly, but did
  // so using tc-lib-entities, which has since been removed from the codebase.

  // version 10 updates entity_buf_decode to fix a bug, so we re-test that function here
  suite('entity_buf_decode bugfix', function() {
    suiteSetup(async function() {
      await testing.resetDb({ testDbUrl: helper.dbUrl });
      await helper.upgradeTo(THIS_VERSION);
    });

    const b64 = x => Buffer.from(x).toString('base64');
    entityBufDecodeTest('0 bufs', { __bufchunks_val: 0 }, '');
    entityBufDecodeTest('empty', { __bufchunks_val: 1, __buf0_val: '' }, '');
    entityBufDecodeTest('simple string', { __bufchunks_val: 1, __buf0_val: b64('Hello') }, 'Hello');
    entityBufDecodeTest('backslashy string', { __bufchunks_val: 1, __buf0_val: b64('uh\\oh') }, 'uh\\oh');
    entityBufDecodeTest('2 huge bufs', hugeBufs.encoded, hugeBufs.decoded);
  });

  test('tables created / removed on upgrade and downgrade', async function() {
    await testing.resetDb({ testDbUrl: helper.dbUrl });
    await helper.upgradeTo(PREV_VERSION);

    await helper.assertTable('wmworker_pools_entities');
    await helper.assertNoTable('worker_pools');

    await helper.upgradeTo(THIS_VERSION);
    await helper.assertNoTable('wmworker_pools_entities');

    await helper.downgradeTo(PREV_VERSION);
    await helper.assertNoTable('worker_pools');
  });
});
