const assert = require('assert').strict;
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');
const slugid = require('slugid');

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(__filename)[1]);

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
  });
});
