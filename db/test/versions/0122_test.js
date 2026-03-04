import assert from 'assert';
import helper from '../helper.js';
import testing from '@taskcluster/lib-testing';
import taskcluster from '@taskcluster/client';

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(import.meta.url)[1]);

suite(testing.suiteName(), function() {
  helper.withDbForVersion();

  test('pagination returns tasks in stable order', async function() {
    await testing.resetDb({ testDbUrl: helper.dbUrl });
    await helper.upgradeTo(THIS_VERSION);

    const db = await helper.setupDb('queue');
    const created = taskcluster.fromNow('0 hours');
    const deadline = taskcluster.fromNow('1 hour');
    const expires = taskcluster.fromNow('2 hours');

    // Create tasks with IDs that would be unordered without ORDER BY
    const taskIds = ['zzz-task', 'aaa-task', 'mmm-task', 'bbb-task', 'yyy-task'];
    for (const taskId of taskIds) {
      await db.fns.create_task_projid(
        taskId, 'prov/wt', 'sched', 'proj', 'group-1',
        JSON.stringify([]), 'all-completed', JSON.stringify([]),
        'high', 5, created, deadline, expires,
        JSON.stringify([]), {}, {}, JSON.stringify([]), {},
      );
    }

    // Fetch page by page (page size 2) and collect all task IDs
    const allTaskIds = [];
    for (let offset = 0; offset < taskIds.length; offset += 2) {
      const page = await db.fns.get_tasks_by_task_group_projid('group-1', 2, offset);
      allTaskIds.push(...page.map(r => r.task_id));
    }

    // All tasks should be returned exactly once, in sorted order
    assert.deepEqual(allTaskIds, [...taskIds].sort());
  });
});
