const testing = require('taskcluster-lib-testing');
const helper = require('../helper');
const assert = require('assert').strict;

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(__filename)[1]);

suite(testing.suiteName(), function() {
  helper.withDbForVersion();

  const taskId = 'WuonSu7CQDeZ0hh-cR_6Ag';

  helper.dbVersionTest({
    version: THIS_VERSION,
    createData: async client => {
      // create the data including a task_queue_id that must be the
      // combined identifier of provisioner_id/worker_type.
      // this is a safe assumption as tested for the previous version.
      await client.query(`
        insert into tasks (
          task_id,
          scheduler_id,
          task_group_id,
          dependencies,
          requires,
          routes,
          priority,
          retries,
          created,
          deadline,
          expires,
          scopes,
          payload,
          metadata,
          tags,
          extra,
          retries_left,
          runs,
          taken_until,
          ever_resolved,
          task_queue_id
        ) values (
          '${taskId}',
          'sch',
          '${taskId}',
          '[]'::jsonb,
          'all-completed',
          '[]'::jsonb,
          'normal',
          0,
          now(),
          now(),
          now(),
          '[]'::jsonb,
          '{}'::jsonb,
          '{}'::jsonb,
          '[]'::jsonb,
          '{}'::jsonb,
          0,
          '[]'::jsonb,
          null,
          false,
          'p/w'
        )`);
    },
    startCheck: async client => {
      const res = await client.query('select task_id from tasks');
      assert.deepEqual(res.rows.map(row => row.task_id), [taskId]);
      await helper.assertNoTableColumn('tasks', 'project_id');
    },
    concurrentCheck: async client => {
      const res = await client.query('select task_id from tasks');
      assert.deepEqual(res.rows.map(row => row.task_id), [taskId]);
    },
    finishedCheck: async client => {
      const res = await client.query('select task_id, project_id from tasks');
      assert.deepEqual(res.rows.map(row => [row.task_id, row.project_id]), [[taskId, null]]);
      await helper.assertTableColumn('tasks', 'project_id');
    },
  });
});
