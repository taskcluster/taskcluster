import { strict as assert } from 'assert';
import testing from 'taskcluster-lib-testing';
import helper from '../helper.js';

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(import.meta.url)[1]);
const PREV_VERSION = THIS_VERSION - 1;

suite(testing.suiteName(), function () {
  helper.withDbForVersion();

  test('tables and columns are created, data is migrated', async function () {
    await testing.resetDb({ testDbUrl: helper.dbUrl });
    const db = await helper.setupDb('worker_manager');

    await helper.upgradeTo(PREV_VERSION);

    await db.deprecatedFns.create_worker_pool(
      'wp/id',
      'provider',
      '[]',
      'descr',
      {
        maxCapacity: 8,
        launchConfigs: [ {
          name: 'cfg1',
        }, {
          name: 'cfg2',
        }],
      },
      new Date(),
      new Date(),
      'me@me.com',
      false,
      { providerdata: true },
    );

    await helper.upgradeTo(THIS_VERSION);
    await helper.assertTableColumn('workers', 'launch_config_id');
    await helper.assertTableColumn('worker_pool_errors', 'launch_config_id');

    const configs = await db.fns.get_worker_pool_launch_configs('wp/id', null, null, null);
    assert.equal(configs.length, 2);

    await helper.downgradeTo(PREV_VERSION);
    await helper.assertNoTable('worker_pool_launch_configs');
    await helper.assertNoTableColumn('workers', 'launch_config_id');
    await helper.assertNoTableColumn('worker_pool_errors', 'launch_config_id');

    const [wp] = await db.deprecatedFns.get_worker_pool_with_capacity('wp/id');
    assert.deepEqual(wp.config, {
      maxCapacity: 8,
      launchConfigs: [ {
        name: 'cfg1',
      }, {
        name: 'cfg2',
      }],
    });
  });
});
