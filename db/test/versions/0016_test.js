const _ = require('lodash');
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');
const assert = require('assert').strict;
const slugid = require('slugid');

suite(testing.suiteName(), function() {
  const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(__filename)[1]);
  helper.withDbForVersion();

  suiteSetup(async function() {
    await testing.resetDb({testDbUrl: helper.dbUrl});
    await helper.upgradeTo(THIS_VERSION);

    // fill a temporary table with a mess of slugids
    await helper.withDbClient(async client => {
      await client.query(`create table test_v${THIS_VERSION} (slugid text, uuid text)`);
      const insert = s =>
        client.query(`insert into test_v${THIS_VERSION} values ($1, $2)`, [s, slugid.decode(s)]);

      // use a few hard-coded slugids to ensure we get special characters, then some randomness
      await insert('VSCO_-TISMKF-qp3Z6_R_w');
      await insert('YqWE3f62S2WC4RxAsTRJXw');
      for (let i = 0; i < 100; i++) {
        await insert(slugid.nice());
        await insert(slugid.v4());
      }
    });
  });

  test('uuid_to_slugid', async function() {
    await helper.withDbClient(async client => {
      const bugs = await client.query(
        `select
           uuid,
           slugid as exp_slugid,
           uuid_to_slugid(uuid) as got_slugid
         from test_v${THIS_VERSION}
         where uuid_to_slugid(uuid) != slugid`);
      assert.deepEqual(bugs.rows, []);
    });
  });

  test('slugid_to_uuid', async function() {
    await helper.withDbClient(async client => {
      const bugs = await client.query(
        `select
           uuid as exp_uuid,
           slugid,
           slugid_to_uuid(slugid) as got_uuid
         from test_v${THIS_VERSION}
         where slugid_to_uuid(slugid) != uuid`);
      assert.deepEqual(bugs.rows, []);
    });
  });
});
