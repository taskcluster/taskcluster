const _ = require('lodash');
const helper = require('../helper');
const assert = require('assert');
const testing = require('taskcluster-lib-testing');

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(__filename)[1]);

suite(testing.suiteName(), function() {

  // A helper to make it easier to create tasks with dummy values within queries
  const makeFieldsForCreation = (opts) => {
    let result = `${opts.taskId || `'tid'`}, ${opts.provisionerId || `'pp'`}, ${opts.workerType || `'wt'`},
            'sid', 'tgid', jsonb_object('{}'), 'all-completed',
            jsonb_object('{}'), 'normal', 0, now(), now(), now(), jsonb_object('{}'),
            jsonb_object('{}'), jsonb_object('{}'), jsonb_object('{}'),
            jsonb_object('{}')`;
    if (opts.withDefaults) {
      result += `, 0, jsonb_build_array(), null, false`;
    }
    return result;
  };

  helper.withDbForVersion();

  helper.dbVersionTest({
    version: THIS_VERSION,
    onlineMigration: true,
    onlineDowngrade: false,
    createData: async client => {
      await client.query(`
        with gen as (
          select generate_series(1, 99) as i
        )
        insert into tasks (task_id,
                           provisioner_id,
                           worker_type,
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
                           ever_resolved)
        select ${makeFieldsForCreation({ taskId: `'tid-' || gen.i`, workerType: `'wt-' || gen.i`, withDefaults: true })}
        from gen`);
    },
    startCheck: async client => {
      // basic check
      const res = await client.query('select task_id, provisioner_id, worker_type from tasks');
      const taskCount = res.rows.length;
      assert(taskCount >= 99, 'data was not created properly');

      // check the schema
      await helper.assertTableColumn('tasks', 'provisioner_id');
      await helper.assertTableColumn('tasks', 'worker_type');
      await helper.assertNoTableColumn('tasks', 'task_queue_id');
    },
    concurrentCheck: async client => {
      // check that the inserted data looks as expected
      const res = await client.query('select task_id, provisioner_id, worker_type from tasks');
      const nextTaskId = res.rows.length + 1;
      const pps = res.rows.map(({ provisioner_id }) => provisioner_id);
      assert.deepEqual(new Set(pps), new Set(['pp']));
      const wts = res.rows.map(({ worker_type }) => worker_type).sort();
      assert.deepEqual(wts, _.range(1, nextTaskId).map(i => `wt-${i}`).sort());
      const tids = res.rows.map(({ task_id }) => task_id).sort();
      assert.deepEqual(tids, _.range(1, nextTaskId).map(i => `tid-${i}`).sort());

      // check that create_task works as expected
      const taskOpts = {
        taskId: `'tid-${nextTaskId}'`,
        provisionerId: `'pp'`,
        workerType: `'wt-${nextTaskId}'`,
      };
      await client.query(`select create_task(${makeFieldsForCreation(taskOpts)})`);

      // check that we can use get_task to retrieve the task we just created
      const taskRes = await client.query(`
        select task_id, provisioner_id, worker_type from get_task(${taskOpts.taskId})
      `);
      const expectedTask = {
        task_id: `tid-${nextTaskId}`,
        provisioner_id: 'pp',
        worker_type: `wt-${nextTaskId}`,
      };
      assert.deepEqual(taskRes.rows[0], expectedTask,
        'the last task created with create_task could not be retrieved with get_task');
    },
    finishedCheck: async client => {
      // check that all tasks have a task_queue_id that is not null
      // and equal to the expected combination of old identifiers
      const res = await client.query('select provisioner_id, worker_type, task_queue_id from tasks');
      res.rows.forEach(({ provisioner_id, worker_type, task_queue_id }) => {
        assert.equal(task_queue_id, `${provisioner_id}/${worker_type}`);
      });

      // check the schema
      await helper.assertTableColumn('tasks', 'provisioner_id');
      await helper.assertTableColumn('tasks', 'worker_type');
      await helper.assertTableColumn('tasks', 'task_queue_id');
    },
  });
});
