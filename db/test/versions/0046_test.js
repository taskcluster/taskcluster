const assert = require('assert');
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(__filename)[1]);
const PREV_VERSION = THIS_VERSION - 1;

suite(testing.suiteName(), function() {
  helper.withDbForVersion();

  test('worker_specs table created / removed on upgrade and downgrade', async function() {
    await testing.resetDb({testDbUrl: helper.dbUrl});
    await helper.upgradeTo(PREV_VERSION);

    await helper.assertTable('worker_pools');
    await helper.assertNoTable('worker_specs');

    await helper.upgradeTo(THIS_VERSION);
    await helper.assertTable('worker_pools');
    await helper.assertTable('worker_specs');

    //await helper.downgradeTo(PREV_VERSION);
    //await helper.assertTable('worker_pools');
    //await helper.assertNoTable('worker_specs');
  });

  test('copy worker_specs over', async function() {
    await testing.resetDb({testDbUrl: helper.dbUrl});
    await helper.upgradeTo(PREV_VERSION);

    const configs = [
      {
        name: 'x',
        minCapacity: 1,
        maxCapacity: 10,
        lifecycle: {},
        launchConfigs: [
          {
            capacityPerInstance: 1,
            workerConfig: {},
            cloudSpecific: [123],
          },
          {
            capacityPerInstance: 1,
            workerConfig: {},
            cloudSpecific: {foo: 5},
          },
        ],
      }, {
        name: 'static',
        minCapacity: 0,
        maxCapacity: 11,
        lifecycle: {},
      }, {
        name: 'y',
        minCapacity: 0,
        maxCapacity: 11,
        lifecycle: {registrationTimeout: 1234},
        launchConfigs: [
          {
            capacityPerInstance: 4,
            workerConfig: {},
            cloudSpecific: {foo: 65},
          },
          {
            capacityPerInstance: 1,
            workerConfig: {},
            cloudSpecific: {foo: 100},
          },
        ],
      },
    ];

    await helper.withDbClient(async client => {
      for await (const {name, ...cfg} of configs) {
        await client.query(`insert into worker_pools values (
          $1,
          'bar',
          'baz',
          'bing',
          false,
          now(),
          now(),
          $2,
          $3,
          $4
          )`, [name, cfg, {}, []]);
      }
    });

    await helper.upgradeTo(THIS_VERSION);

    await helper.withDbClient(async client => {
      const {rows: [pool]} = await client.query(`select * from worker_pools`);
      assert.equal(pool.config.launchConfigs, undefined);
      const {rows: specs} = await client.query(`select * from worker_specs`);
      console.log(specs);
    });
  });
});
