const assert = require('assert').strict;
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');
const slugid = require('slugid');

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(__filename)[1]);
const PREV_VERSION = THIS_VERSION - 1;

suite(testing.suiteName(), function() {
  helper.withDbForVersion();

  test('task group seal column', async function() {
    await testing.resetDb({ testDbUrl: helper.dbUrl });
    await helper.upgradeTo(PREV_VERSION);

    await helper.assertTable('task_groups');
    await helper.assertNoTableColumn('task_groups', 'sealed');

    await helper.upgradeTo(THIS_VERSION);
    await helper.assertTable('task_groups');
    await helper.assertTableColumn('task_groups', 'sealed');
  });

  test('seal function', async function() {
    await testing.resetDb({ testDbUrl: helper.dbUrl });
    await helper.upgradeTo(THIS_VERSION);
    const db = await helper.setupDb('queue');

    const taskGroupId = slugid.v4();
    await db.fns.ensure_task_group(taskGroupId, 'scheduler-0', new Date().toISOString());

    const isSealed = await db.fns.is_task_group_sealed(taskGroupId);
    assert.equal(false, isSealed[0].is_task_group_sealed);

    const res1 = await db.fns.get_task_group2(taskGroupId);
    assert.equal(res1[0].task_group_id, taskGroupId);
    assert.equal(res1[0].scheduler_id, 'scheduler-0');
    assert.equal(res1[0].sealed, null);

    const [res2] = await db.fns.seal_task_group(taskGroupId);
    assert.equal(res2.task_group_id, taskGroupId);
    assert.equal(res2.scheduler_id, 'scheduler-0');
    assert.notEqual(res2.sealed, null);

    const isSealed2 = await db.fns.is_task_group_sealed(taskGroupId);
    assert.equal(true, isSealed2[0].is_task_group_sealed);

    // make sure sealed timestamp stays the same
    const [res3] = await db.fns.seal_task_group(taskGroupId);
    assert.deepEqual(res3, res2);
  });
});
