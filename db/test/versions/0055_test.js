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

  let taskCounter = 0;

  helper.withDbForVersion();

  helper.dbVersionTest({
    version: THIS_VERSION,
    onlineMigration: true,
    onlineDowngrade: false,
    createData: async client => {
      taskCounter = 0;
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
      // Update task counter
      taskCounter = 100;
    },
    startCheck: async client => {
      // check that the data is as we inserted it (even after migration+downgrade)
      const res = await client.query('select task_id, worker_type from tasks');
      const wts = res.rows.map(({ worker_type }) => worker_type).sort();
      assert.deepEqual(wts, _.range(1, taskCounter).map(i => `wt-${i}`).sort());
      const tids = res.rows.map(({ task_id }) => task_id).sort();
      assert.deepEqual(tids, _.range(1, taskCounter).map(i => `tid-${i}`).sort());

      // and check the schema
      await helper.assertTableColumn('tasks', 'provisioner_id');
      await helper.assertTableColumn('tasks', 'worker_type');
      await helper.assertNoTableColumn('tasks', 'task_queue_id');
    },
    concurrentCheck: async client => {
      // check that the data can still be retrieved the same way
      const res = await client.query('select task_id, provisioner_id, worker_type from tasks');
      const wts = res.rows.map(({ worker_type }) => worker_type).sort();
      assert.deepEqual(wts, _.range(1, taskCounter).map(i => `wt-${i}`).sort());
      const tids = res.rows.map(({ task_id }) => task_id).sort();
      assert.deepEqual(tids, _.range(1, taskCounter).map(i => `tid-${i}`).sort());
      const pps = res.rows.map(({ provisioner_id }) => provisioner_id);
      // all provisioner id's so far have the same value
      assert.deepEqual(new Set(pps), new Set(['pp']));

      // check that create_task works as expected
      const taskOpts = {
        taskId: `'tid-${taskCounter}'`,
        provisionerId: `'pp'`,
        workerType: `'wt-${taskCounter}'`,
      };
      await client.query(`select create_task(${makeFieldsForCreation(taskOpts)})`);
      // check that we can use get_task to retrieve the task we just created
      const taskRes = await client.query(`select task_id, provisioner_id, worker_type from get_task(${taskOpts.taskId})`);
      const expectedTask = {
        task_id: `tid-${taskCounter}`,
        provisioner_id: 'pp',
        worker_type: `wt-${taskCounter}`,
      };
      assert.deepEqual(taskRes.rows[0], expectedTask, 'the last task created with create_task could not be retrieved with get_task');

      taskCounter += 1;
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
