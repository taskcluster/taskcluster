import { strict as assert } from 'assert';
import helper from '../helper.js';
import testing from '@taskcluster/lib-testing';
import slugid from 'slugid';

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(import.meta.url)[1]);

suite(testing.suiteName(), function() {
  helper.withDbForVersion();

  test('cancel task group function', async function() {
    await testing.resetDb({ testDbUrl: helper.dbUrl });
    await helper.upgradeTo(THIS_VERSION);
    const db = await helper.setupDb('queue');

    const taskGroupId = slugid.v4();
    await db.fns.ensure_task_group(taskGroupId, 'scheduler-0', new Date().toISOString());

    const res = await db.fns.cancel_task_group(taskGroupId, 'because');
    assert.equal(res.length, 0);

    const res2 = await db.fns.get_task_group_size(taskGroupId);
    assert.equal(res2[0].get_task_group_size, 0);
  });
});
