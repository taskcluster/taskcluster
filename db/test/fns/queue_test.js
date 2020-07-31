const assert = require('assert').strict;
const {cloneDeep, range} = require('lodash');
const {fromNow} = require('taskcluster-client');
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');
const {UNIQUE_VIOLATION} = require('taskcluster-lib-postgres');
const taskcluster = require('taskcluster-client');

suite(testing.suiteName(), function() {
  helper.withDbForProcs({ serviceName: 'queue' });

  suite('message queue', function() {
    setup('reset table', async function() {
      await helper.withDbClient(async client => {
        await client.query('delete from azure_queue_messages');
      });
    });

    helper.dbTest('count empty queue', async function(db) {
      const result = await db.fns.azure_queue_count("deps");
      assert.deepEqual(result, [{azure_queue_count: 0}]);
    });

    helper.dbTest('count queue containing messages', async function(db) {
      await db.fns.azure_queue_put("deps", "expired", fromNow('0 seconds'), fromNow('-10 seconds'));
      await db.fns.azure_queue_put("deps", "visible", fromNow('0 seconds'), fromNow('10 seconds'));
      await db.fns.azure_queue_put("deps", "invisible", fromNow('10 seconds'), fromNow('10 seconds'));
      const result = await db.fns.azure_queue_count("deps");
      // expired message is not counted, leaving only invisible and visible
      assert.deepEqual(result, [{azure_queue_count: 2}]);
    });

    helper.dbTest('getting messages on an empty queue', async function(db) {
      const result = await db.fns.azure_queue_get("deps", fromNow('10 seconds'), 1);
      assert.deepEqual(result, []);
    });

    helper.dbTest('getting messages on a queue with invisible messages', async function(db) {
      await db.fns.azure_queue_put("deps", "invisible", fromNow('10 seconds'), fromNow('10 seconds'));
      const result = await db.fns.azure_queue_get("deps", fromNow('10 seconds'), 1);
      assert.deepEqual(result, []);
    });

    helper.dbTest('getting messages on a queue with visible messages', async function(db) {
      await db.fns.azure_queue_put("deps", "visible", fromNow('0 seconds'), fromNow('10 seconds'));
      const result = await db.fns.azure_queue_get("deps", fromNow('10 seconds'), 1);
      assert.deepEqual(result.map(({message_text}) => message_text), ['visible']);
      // check that message was marked invisible
      const result2 = await db.fns.azure_queue_get("deps", fromNow('10 seconds'), 1);
      assert.deepEqual(result2, []);
    });

    helper.dbTest('getting and deleting messages', async function(db) {
      await db.fns.azure_queue_put("deps", "visible", fromNow('0 seconds'), fromNow('10 seconds'));
      const result = await db.fns.azure_queue_get("deps", fromNow('0 seconds'), 1);
      assert.deepEqual(result.map(({message_text}) => message_text), ['visible']);
      await db.fns.azure_queue_delete("deps", result[0].message_id, result[0].pop_receipt);
      const result2 = await db.fns.azure_queue_get("deps", fromNow('10 seconds'), 1);
      assert.deepEqual(result2, []);
    });

    helper.dbTest('making messages visible again', async function(db) {
      await db.fns.azure_queue_put("deps", "visible", fromNow('0 seconds'), fromNow('10 seconds'));
      const result = await db.fns.azure_queue_get("deps", fromNow('10 seconds'), 1);
      assert.deepEqual(result.map(({message_text}) => message_text), ['visible']);
      await db.fns.azure_queue_update("deps", "visible2", result[0].message_id, result[0].pop_receipt, fromNow('0 seconds'));
      const result2 = await db.fns.azure_queue_get("deps", fromNow('10 seconds'), 1);
      assert.deepEqual(result2.map(({message_text}) => message_text), ['visible2']);
    });

    helper.dbTest('deleting expired messages', async function(db) {
      await db.fns.azure_queue_put("deps", "exp1", fromNow('0 seconds'), fromNow('0 seconds'));
      await db.fns.azure_queue_put("deps", "exp2", fromNow('10 seconds'), fromNow('0 seconds'));
      await db.fns.azure_queue_delete_expired();
      await helper.withDbClient(async client => {
        const res = await client.query('select count(*) from azure_queue_messages');
        assert.deepEqual(res.rows[0], {count: '0'});
      });
    });
  });

  suite('task/task-group functions', function() {
    setup('reset tables', async function() {
      await helper.withDbClient(async client => {
        await client.query('truncate tasks');
        await client.query('truncate task_groups');
        await client.query('truncate task_dependencies');
      });
    });

    suite('ensure_task_group/get_task_group', function() {
      helper.dbTest('ensure_task_group in parallel with the same scheduler_id', async function(db) {
        const expires = taskcluster.fromNow('1 hour');
        await Promise.all([
          db.fns.ensure_task_group('0cM7dCL2Rpaz0wdnDG4LLg', 'sched', expires),
          db.fns.ensure_task_group('0cM7dCL2Rpaz0wdnDG4LLg', 'sched', expires),
          db.fns.ensure_task_group('0cM7dCL2Rpaz0wdnDG4LLg', 'sched', expires),
          db.fns.ensure_task_group('0cM7dCL2Rpaz0wdnDG4LLg', 'sched', expires),
        ]);

        const tgs = await db.fns.get_task_group('0cM7dCL2Rpaz0wdnDG4LLg');
        assert.equal(tgs.length, 1);
        assert.equal(tgs[0].task_group_id, '0cM7dCL2Rpaz0wdnDG4LLg');
        assert.equal(tgs[0].scheduler_id, 'sched');
        assert(tgs[0].expires > expires);
      });

      helper.dbTest('ensure_task_group twice with different scheduler_id', async function(db) {
        const expires = taskcluster.fromNow('1 hour');
        await db.fns.ensure_task_group('0cM7dCL2Rpaz0wdnDG4LLg', 'sched1', expires);
        await assert.rejects(
          () => db.fns.ensure_task_group('0cM7dCL2Rpaz0wdnDG4LLg', 'sched2', expires),
          err => err.code === UNIQUE_VIOLATION);

        const tgs = await db.fns.get_task_group('0cM7dCL2Rpaz0wdnDG4LLg');
        assert.equal(tgs.length, 1);
        assert.equal(tgs[0].task_group_id, '0cM7dCL2Rpaz0wdnDG4LLg');
        assert.equal(tgs[0].scheduler_id, 'sched1');
        assert(tgs[0].expires > expires);
      });

      helper.dbTest('ensure_task_group twice with different task_group_id and scheduler_id', async function(db) {
        const expires = taskcluster.fromNow('1 hour');
        await db.fns.ensure_task_group('0cM7dCL2Rpaz0wdnDG4LLg', 'sched', expires);
        await db.fns.ensure_task_group('jcy-h6_7SFuRuKLPByiFTg', 'sched', expires);

        const tgs = await db.fns.get_task_group('jcy-h6_7SFuRuKLPByiFTg');
        assert.equal(tgs.length, 1);
        assert.equal(tgs[0].task_group_id, 'jcy-h6_7SFuRuKLPByiFTg');
        assert.equal(tgs[0].scheduler_id, 'sched');
        assert(tgs[0].expires > expires);
      });
    });

    suite('expire_task_groups', function() {
      helper.dbTest('expire expired task groups', async function(db) {
        await Promise.all([
          // 5 hours ago since ensure_task_group rounds up by an hour
          db.fns.ensure_task_group('111111L2Rpaz0wdnDG4LLg', 'sched1', taskcluster.fromNow('-5 hours')),
          db.fns.ensure_task_group('222222L2Rpaz0wdnDG4LLg', 'sched2', taskcluster.fromNow('1 hour')),
          db.fns.ensure_task_group('333333L2Rpaz0wdnDG4LLg', 'sched3', taskcluster.fromNow('-5 hours')),
          db.fns.ensure_task_group('444444L2Rpaz0wdnDG4LLg', 'sched4', taskcluster.fromNow('1 hour')),
        ]);

        const res = await db.fns.expire_task_groups(new Date());
        assert.deepEqual(res, [{expire_task_groups: 2}]);

        assert.equal((await db.fns.get_task_group('11111112Rpaz0wdnDG4LLg')).length, 0);
        assert.equal((await db.fns.get_task_group('222222L2Rpaz0wdnDG4LLg')).length, 1);
        assert.equal((await db.fns.get_task_group('333333L2Rpaz0wdnDG4LLg')).length, 0);
        assert.equal((await db.fns.get_task_group('444444L2Rpaz0wdnDG4LLg')).length, 1);
      });

      helper.dbTest('ensure_task_group twice with different scheduler_id', async function(db) {
        const expires = taskcluster.fromNow('1 hour');
        await db.fns.ensure_task_group('0cM7dCL2Rpaz0wdnDG4LLg', 'sched1', expires);
        await assert.rejects(
          () => db.fns.ensure_task_group('0cM7dCL2Rpaz0wdnDG4LLg', 'sched2', expires),
          err => err.code === UNIQUE_VIOLATION);

        const tgs = await db.fns.get_task_group('0cM7dCL2Rpaz0wdnDG4LLg');
        assert.equal(tgs.length, 1);
        assert.equal(tgs[0].task_group_id, '0cM7dCL2Rpaz0wdnDG4LLg');
        assert.equal(tgs[0].scheduler_id, 'sched1');
        assert(tgs[0].expires > expires);
      });

      helper.dbTest('ensure_task_group twice with different task_group_id and scheduler_id', async function(db) {
        const expires = taskcluster.fromNow('1 hour');
        await db.fns.ensure_task_group('0cM7dCL2Rpaz0wdnDG4LLg', 'sched', expires);
        await db.fns.ensure_task_group('jcy-h6_7SFuRuKLPByiFTg', 'sched', expires);

        const tgs = await db.fns.get_task_group('jcy-h6_7SFuRuKLPByiFTg');
        assert.equal(tgs.length, 1);
        assert.equal(tgs[0].task_group_id, 'jcy-h6_7SFuRuKLPByiFTg');
        assert.equal(tgs[0].scheduler_id, 'sched');
        assert(tgs[0].expires > expires);
      });
    });

    const taskId = 'hOTDAv0gRfW6YA2hm4n5FQ';
    const created = taskcluster.fromNow('0 hours');
    const deadline = taskcluster.fromNow('1 hour');
    const expires = taskcluster.fromNow('2 hours');
    const create = async (db, options = {}) => {
      await db.fns.create_task(
        taskId,
        'prov',
        'wt',
        'sched',
        '0cM7dCL2Rpaz0wdnDG4LLg',
        JSON.stringify(['jcy-h6_7SFuRuKLPByiFTg']),
        'all-completed',
        JSON.stringify(['index.foo']),
        'high',
        5,
        created,
        options.deadline || deadline,
        options.expires || expires,
        JSON.stringify(['a:scope']),
        {payload: true},
        {metadata: true},
        JSON.stringify(["you're", "it"]),
        {extra: true},
      );
    };

    // fix 'runs' for easier assert.deepEqual, since dates are generated internally.  This
    // replaces dates with the string "date".
    const fixRuns = rows => {
      rows = cloneDeep(rows);
      for (let row of rows) {
        for (let run of row.runs) {
          for (let prop of ['scheduled', 'started', 'resolved', 'takenUntil']) {
            if (prop in run && typeof run[prop] === 'string' && !isNaN(new Date(run[prop]))) {
              run[prop] = 'date';
            }
          }
        }
      }
      return rows;
    };

    const setTaskRuns = async (db, runs) => {
      await helper.withDbClient(async client => {
        await client.query('update tasks set runs = $2 where task_id = $1', [taskId, JSON.stringify(runs)]);
      });
    };

    const setTaskTakenUntil = async (db, taken_until) => {
      await helper.withDbClient(async client => {
        await client.query('update tasks set taken_until = $2 where task_id = $1', [taskId, taken_until]);
      });
    };

    const setTaskRetriesLeft = async (db, retries_left) => {
      await helper.withDbClient(async client => {
        await client.query('update tasks set retries_left = $2 where task_id = $1', [taskId, retries_left]);
      });
    };

    helper.dbTest('create_task/get_task', async function(db) {
      await create(db);
      const res = await db.fns.get_task(taskId);
      assert.equal(res.length, 1);
      assert.equal(res[0].task_id, taskId);
      assert.equal(res[0].provisioner_id, 'prov');
      assert.equal(res[0].worker_type, 'wt');
      assert.equal(res[0].scheduler_id, 'sched');
      assert.equal(res[0].task_group_id, '0cM7dCL2Rpaz0wdnDG4LLg');
      assert.deepEqual(res[0].dependencies, ['jcy-h6_7SFuRuKLPByiFTg']);
      assert.equal(res[0].requires, 'all-completed');
      assert.deepEqual(res[0].routes, ['index.foo']);
      assert.equal(res[0].priority, 'high');
      assert.equal(res[0].retries, 5);
      assert.deepEqual(res[0].created, created);
      assert.deepEqual(res[0].deadline, deadline);
      assert.deepEqual(res[0].expires, expires);
      assert.deepEqual(res[0].scopes, ['a:scope']);
      assert.deepEqual(res[0].payload, {payload: true});
      assert.deepEqual(res[0].metadata, {metadata: true});
      assert.deepEqual(res[0].tags, ["you're", "it"]);
      assert.deepEqual(res[0].extra, {extra: true});
      assert.deepEqual(res[0].runs, []);
      assert.equal(res[0].retries_left, 5);
      assert.deepEqual(res[0].taken_until, null);
    });

    helper.dbTest('create_task twice (UNIQUE_VIOLATION)', async function(db) {
      await create(db);
      await assert.rejects(
        () => create(db),
        err => err.code === UNIQUE_VIOLATION);
    });

    helper.dbTest('get_task with no such task', async function(db) {
      const res = await db.fns.get_task('hOTDAv0gRfW6YA2hm4n5FQ');
      assert.deepEqual(res, []);
    });

    helper.dbTest('remove_task', async function(db) {
      await create(db);
      await db.fns.remove_task(taskId);
      const res = await db.fns.get_task(taskId);
      assert.deepEqual(res, []);
    });

    helper.dbTest('remove_task with no such task', async function(db) {
      await db.fns.remove_task(taskId);
      // ..didn't throw an error..
      const res = await db.fns.get_task(taskId);
      assert.deepEqual(res, []);
    });

    suite('schedule_task', function() {
      helper.dbTest('no such task', async function(db) {
        const res = await db.fns.schedule_task(taskId, 'because');
        assert.deepEqual(res, []);
      });

      helper.dbTest('task with existing runs', async function(db) {
        await create(db);
        await setTaskRuns(db, [{state: 'pending'}]);
        const res = await db.fns.schedule_task(taskId, 'because');
        assert.deepEqual(res, []);
        const task = await db.fns.get_task(taskId);
        // no change
        assert.deepEqual(task[0].runs, [{state: 'pending'}]);
      });

      helper.dbTest('task with no runs', async function(db) {
        await create(db);
        const res = fixRuns(await db.fns.schedule_task(taskId, 'because'));
        assert.equal(res.length, 1);
        assert.deepEqual(res, [{
          retries_left: 5,
          runs: [{state: 'pending', reasonCreated: 'because', scheduled: 'date'}],
          taken_until: null,
        }]);
        const task = fixRuns(await db.fns.get_task(taskId));
        assert.deepEqual(task[0].runs, res[0].runs);
      });
    });

    suite('rerun_task', function() {
      helper.dbTest('no such task', async function(db) {
        const res = await db.fns.rerun_task(taskId);
        assert.deepEqual(res, []);
      });

      for (let state of ['running', 'pending']) {
        helper.dbTest(`task with ${state} run`, async function(db) {
          await create(db);
          await setTaskRuns(db, [{state}]);
          const res = fixRuns(await db.fns.rerun_task(taskId));
          assert.deepEqual(res, []);
          const task = fixRuns(await db.fns.get_task(taskId));
          assert.deepEqual(task[0].runs, [{state}]);
        });
      }

      helper.dbTest(`task with too many runs`, async function(db) {
        await create(db);
        await setTaskRuns(db, range(50).map(() => ({state: 'exception'})));
        const res = fixRuns(await db.fns.rerun_task(taskId));
        assert.deepEqual(res, []);
      });

      helper.dbTest(`task with almost too many runs`, async function(db) {
        await create(db);
        await setTaskRuns(db, range(48).map(() => ({state: 'exception'})));
        const res = fixRuns(await db.fns.rerun_task(taskId));
        assert.deepEqual(res, [{
          retries_left: 1,
          runs: [
            ...range(48).map(() => ({state: 'exception'})),
            {state: 'pending', reasonCreated: 'rerun', scheduled: 'date'},
          ],
          taken_until: null,
        }]);
        const task = fixRuns(await db.fns.get_task(taskId));
        assert.deepEqual(task[0].runs, res[0].runs);
      });

      helper.dbTest('task with existing run', async function(db) {
        await create(db);
        await setTaskRuns(db, [{state: 'exception'}]);
        const res = fixRuns(await db.fns.rerun_task(taskId));
        assert.deepEqual(res, [{
          retries_left: 5,
          runs: [{state: 'exception'}, {state: 'pending', reasonCreated: 'rerun', scheduled: 'date'}],
          taken_until: null,
        }]);
        const task = fixRuns(await db.fns.get_task(taskId));
        assert.deepEqual(task[0].runs, res[0].runs);
      });

      helper.dbTest('task with no runs', async function(db) {
        await create(db);
        const res = fixRuns(await db.fns.rerun_task(taskId));
        assert.equal(res.length, 1);
        assert.deepEqual(res, [{
          retries_left: 5,
          runs: [{state: 'pending', reasonCreated: 'rerun', scheduled: 'date'}],
          taken_until: null,
        }]);
        const task = fixRuns(await db.fns.get_task(taskId));
        assert.deepEqual(task[0].runs, res[0].runs);
      });
    });

    suite('cancel_task', function() {
      helper.dbTest('no such task', async function(db) {
        const res = await db.fns.cancel_task(taskId, 'because');
        assert.deepEqual(res, []);
      });

      for (let state of ['exception', 'completed']) {
        helper.dbTest(`task with ${state} run`, async function(db) {
          await create(db);
          await setTaskRuns(db, [{state}]);
          const res = fixRuns(await db.fns.cancel_task(taskId, 'because'));
          assert.deepEqual(res, []);
          const task = fixRuns(await db.fns.get_task(taskId));
          assert.deepEqual(task[0].runs, [{state}]);
        });
      }

      helper.dbTest('task with existing run', async function(db) {
        await create(db);
        await setTaskRuns(db, [{state: 'running'}]);
        await setTaskTakenUntil(db, new Date());
        const res = fixRuns(await db.fns.cancel_task(taskId, 'because'));
        assert.deepEqual(res, [{
          retries_left: 5,
          runs: [{state: 'exception', reasonResolved: 'because', resolved: 'date'}],
          taken_until: null,
        }]);
        const task = fixRuns(await db.fns.get_task(taskId));
        assert.deepEqual(task[0].runs, res[0].runs);
      });

      helper.dbTest('task with no runs', async function(db) {
        await create(db);
        const res = fixRuns(await db.fns.cancel_task(taskId, 'because'));
        assert.equal(res.length, 1);
        assert.deepEqual(res, [{
          retries_left: 5,
          runs: [{state: 'exception', reasonCreated: 'exception', reasonResolved: 'because', scheduled: 'date', resolved: 'date'}],
          taken_until: null,
        }]);
        const task = fixRuns(await db.fns.get_task(taskId));
        assert.deepEqual(task[0].runs, res[0].runs);
      });
    });

    suite('claim_task', function() {
      const takenUntil = new Date();

      helper.dbTest('no such task', async function(db) {
        const res = await db.fns.claim_task(taskId, 0, 'wg', 'wi', 'psst', takenUntil);
        assert.deepEqual(res, []);
      });

      helper.dbTest('task with no runs', async function(db) {
        await create(db);
        const res = fixRuns(await db.fns.claim_task(taskId, 0, 'wg', 'wi', 'psst', takenUntil));
        assert.deepEqual(res, []);
      });

      helper.dbTest('task with a run but not claiming that run', async function(db) {
        await create(db);
        // NOTE: two pending runs is impossible, but we want to see that the function correctly
        // sees that run 0 is not the latest run, even if it is pending
        await setTaskRuns(db, [{state: 'pending'}, {state: 'pending'}]);
        const res = fixRuns(await db.fns.claim_task(taskId, 0, 'wg', 'wi', 'psst', takenUntil));
        assert.deepEqual(res, []);
      });

      for (let state of ['exception', 'completed', 'failed', 'running']) {
        helper.dbTest(`task with ${state} run`, async function(db) {
          await create(db);
          await setTaskRuns(db, [{state}]);
          const res = fixRuns(await db.fns.claim_task(taskId, 0, 'wg', 'wi', 'psst', takenUntil));
          assert.deepEqual(res, []);
          const task = fixRuns(await db.fns.get_task(taskId));
          assert.deepEqual(task[0].runs, [{state}]);
        });
      }

      helper.dbTest('task with pending run', async function(db) {
        await create(db);
        await setTaskRuns(db, [{state: 'pending'}]);
        const res = fixRuns(await db.fns.claim_task(taskId, 0, 'wg', 'wi', 'psst', takenUntil));
        assert.deepEqual(res, [{
          retries_left: 5,
          runs: [{
            state: 'running',
            workerGroup: 'wg',
            workerId: 'wi',
            hintId: 'psst',
            takenUntil: 'date',
            started: 'date',
          }],
          taken_until: takenUntil,
        }]);
        const task = fixRuns(await db.fns.get_task(taskId));
        assert.deepEqual(task[0].runs, res[0].runs);
        assert.deepEqual(task[0].taken_until, res[0].taken_until);
      });
    });

    suite('reclaim_task', function() {
      const takenUntil = new Date();

      helper.dbTest('no such task', async function(db) {
        const res = await db.fns.reclaim_task(taskId, 0, takenUntil);
        assert.deepEqual(res, []);
      });

      helper.dbTest('task with no runs', async function(db) {
        await create(db);
        const res = fixRuns(await db.fns.reclaim_task(taskId, 0, takenUntil));
        assert.deepEqual(res, []);
      });

      helper.dbTest('task where runId is not latest', async function(db) {
        await create(db);
        await setTaskRuns(db, [{state: 'running'}, {state: 'running'}]);
        const res = fixRuns(await db.fns.reclaim_task(taskId, 0, takenUntil));
        assert.deepEqual(res, []);
      });

      for (let state of ['exception', 'completed', 'failed', 'pending']) {
        helper.dbTest(`task with ${state} run`, async function(db) {
          await create(db);
          await setTaskRuns(db, [{state}]);
          const res = fixRuns(await db.fns.reclaim_task(taskId, 0, takenUntil));
          assert.deepEqual(res, []);
          const task = fixRuns(await db.fns.get_task(taskId));
          assert.deepEqual(task[0].runs, [{state}]);
        });
      }

      helper.dbTest('task with running run', async function(db) {
        await create(db);
        await setTaskRuns(db, [
          {state: 'exception'},
          {state: 'running', takenUntil: taskcluster.fromNow('-1 hour')},
        ]);
        let res = await db.fns.reclaim_task(taskId, 1, takenUntil);
        // see that takenUntil was updated before calling fixRuns..
        assert.deepEqual(new Date(res[0].runs[1].takenUntil), takenUntil);
        res = fixRuns(res);
        assert.deepEqual(res, [{
          retries_left: 5,
          runs: [
            {state: 'exception'},
            {state: 'running', takenUntil: 'date'},
          ],
          taken_until: takenUntil,
        }]);
        const task = fixRuns(await db.fns.get_task(taskId));
        assert.deepEqual(task[0].runs, res[0].runs);
        assert.deepEqual(task[0].taken_until, res[0].taken_until);
      });
    });

    suite('resolve_task', function() {
      helper.dbTest('no such task', async function(db) {
        const res = await db.fns.resolve_task(taskId, 0, 'exception', 'because', null);
        assert.deepEqual(res, []);
      });

      helper.dbTest('task with no runs', async function(db) {
        await create(db);
        const res = fixRuns(await db.fns.resolve_task(taskId, 0, 'exception', 'because', null));
        assert.deepEqual(res, []);
      });

      helper.dbTest('task where runId is not latest', async function(db) {
        await create(db);
        await setTaskRuns(db, [{state: 'running'}, {state: 'running'}]);
        const res = fixRuns(await db.fns.resolve_task(taskId, 0, 'exception', 'because', null));
        assert.deepEqual(res, []);
      });

      for (let state of ['exception', 'completed', 'failed', 'pending']) {
        helper.dbTest(`task with ${state} run`, async function(db) {
          await create(db);
          await setTaskRuns(db, [{state}]);
          const res = fixRuns(await db.fns.resolve_task(taskId, 0, 'exception', 'because', null));
          assert.deepEqual(res, []);
          const task = fixRuns(await db.fns.get_task(taskId));
          assert.deepEqual(task[0].runs, [{state}]);
        });
      }

      helper.dbTest('task with running run', async function(db) {
        const oldTakenUntil = new Date();
        await create(db);
        await setTaskRuns(db, [
          {state: 'exception'},
          {state: 'running', takenUntil: oldTakenUntil.toJSON()},
        ]);
        let res = await db.fns.resolve_task(taskId, 1, 'exception', 'because', null);
        // see that takenUntil was *not* updated before calling fixRuns..
        assert.deepEqual(new Date(res[0].runs[1].takenUntil), oldTakenUntil);
        res = fixRuns(res);
        assert.deepEqual(res, [{
          retries_left: 5,
          runs: [
            {state: 'exception'},
            {state: 'exception', reasonResolved: 'because', resolved: 'date', takenUntil: 'date'},
          ],
          // task.taken_until *is* reset
          taken_until: null,
        }]);
        const task = fixRuns(await db.fns.get_task(taskId));
        assert.deepEqual(task[0].runs, res[0].runs);
        assert.deepEqual(task[0].taken_until, res[0].taken_until);
      });

      helper.dbTest('task with running run, with retry reason', async function(db) {
        const oldTakenUntil = new Date();
        await create(db);
        await setTaskRuns(db, [
          {state: 'exception'},
          {state: 'running', takenUntil: oldTakenUntil.toJSON()},
        ]);
        let res = fixRuns(await db.fns.resolve_task(taskId, 1, 'exception', 'because', 'i-said-so'));
        assert.deepEqual(res, [{
          retries_left: 4,
          runs: [
            {state: 'exception'},
            {state: 'exception', reasonResolved: 'because', resolved: 'date', takenUntil: 'date'},
            {state: 'pending', reasonCreated: 'i-said-so', scheduled: 'date'},
          ],
          taken_until: null,
        }]);
        const task = fixRuns(await db.fns.get_task(taskId));
        assert.deepEqual(task[0].runs, res[0].runs);
        assert.deepEqual(task[0].taken_until, res[0].taken_until);
      });
    });

    suite('check_task_claim', function() {
      const takenUntil = new Date();

      helper.dbTest('no such task', async function(db) {
        const res = await db.fns.check_task_claim(taskId, 0, takenUntil);
        assert.deepEqual(res, []);
      });

      helper.dbTest('task with no runs', async function(db) {
        await create(db);
        await setTaskTakenUntil(db, takenUntil);
        const res = fixRuns(await db.fns.check_task_claim(taskId, 0, takenUntil));
        assert.deepEqual(res, []);
      });

      helper.dbTest('task where runId is not latest', async function(db) {
        await create(db);
        await setTaskTakenUntil(db, takenUntil);
        await setTaskRuns(db, [{state: 'running'}, {state: 'running'}]);
        const res = fixRuns(await db.fns.check_task_claim(taskId, 0, takenUntil));
        assert.deepEqual(res, []);
      });

      for (let state of ['exception', 'completed', 'failed', 'pending']) {
        helper.dbTest(`task with ${state} run`, async function(db) {
          await create(db);
          await setTaskTakenUntil(db, takenUntil);
          await setTaskRuns(db, [{state}]);
          const res = fixRuns(await db.fns.check_task_claim(taskId, 0, takenUntil));
          assert.deepEqual(res, []);
          const task = fixRuns(await db.fns.get_task(taskId));
          assert.deepEqual(task[0].runs, [{state}]);
        });
      }

      helper.dbTest('task with running run, null task.takenUntil', async function(db) {
        await create(db);
        await setTaskTakenUntil(db, null);
        await setTaskRuns(db, [
          {state: 'running', takenUntil: takenUntil.toJSON()},
        ]);
        let res = await db.fns.check_task_claim(taskId, 0, takenUntil);
        assert.deepEqual(res, []);
      });

      helper.dbTest('task with running run, mismatched task.takenUntil', async function(db) {
        await create(db);
        await setTaskTakenUntil(db, taskcluster.fromNow('1 hour'));
        await setTaskRuns(db, [
          {state: 'running', takenUntil: takenUntil.toJSON()},
        ]);
        let res = await db.fns.check_task_claim(taskId, 0, takenUntil);
        assert.deepEqual(res, []);
      });

      helper.dbTest('task with running run, mismatched run.takenUntil', async function(db) {
        await create(db);
        await setTaskTakenUntil(db, takenUntil);
        await setTaskRuns(db, [
          {state: 'running', takenUntil: taskcluster.fromNow('1 hour').toJSON()},
        ]);
        let res = await db.fns.check_task_claim(taskId, 0, takenUntil);
        assert.deepEqual(res, []);
      });

      helper.dbTest('task with deadline exceeded', async function(db) {
        await create(db, {deadline: taskcluster.fromNow('-1 hour')});
        await setTaskTakenUntil(db, takenUntil);
        await setTaskRuns(db, [
          {state: 'running', takenUntil: takenUntil.toJSON()},
        ]);
        let res = await db.fns.check_task_claim(taskId, 0, takenUntil);
        assert.deepEqual(res, []);
      });

      helper.dbTest('task with running run', async function(db) {
        await create(db);
        await setTaskTakenUntil(db, takenUntil);
        await setTaskRuns(db, [
          {state: 'exception'},
          {state: 'running', takenUntil: takenUntil.toJSON()},
        ]);
        let res = await db.fns.check_task_claim(taskId, 1, takenUntil);
        // see that takenUntil was *not* updated before calling fixRuns..
        assert.deepEqual(new Date(res[0].runs[1].takenUntil), takenUntil);
        res = fixRuns(res);
        assert.deepEqual(res, [{
          retries_left: 4,
          runs: [
            {state: 'exception'},
            {state: 'exception', reasonResolved: 'claim-expired', resolved: 'date', takenUntil: 'date'},
            {state: 'pending', reasonCreated: 'retry', scheduled: 'date'},
          ],
          taken_until: null,
        }]);
        const task = fixRuns(await db.fns.get_task(taskId));
        assert.deepEqual(task[0].runs, res[0].runs);
        assert.deepEqual(task[0].taken_until, res[0].taken_until);
      });

      helper.dbTest('task with running run, no retries left', async function(db) {
        await create(db);
        await setTaskTakenUntil(db, takenUntil);
        await setTaskRetriesLeft(db, 0);
        await setTaskRuns(db, [
          {state: 'exception'},
          {state: 'running', takenUntil: takenUntil.toJSON()},
        ]);
        let res = await db.fns.check_task_claim(taskId, 1, takenUntil);
        // see that takenUntil was *not* updated before calling fixRuns..
        assert.deepEqual(new Date(res[0].runs[1].takenUntil), takenUntil);
        res = fixRuns(res);
        assert.deepEqual(res, [{
          retries_left: 0,
          runs: [
            {state: 'exception'},
            {state: 'exception', reasonResolved: 'claim-expired', resolved: 'date', takenUntil: 'date'},
          ],
          taken_until: null,
        }]);
        const task = fixRuns(await db.fns.get_task(taskId));
        assert.deepEqual(task[0].runs, res[0].runs);
        assert.deepEqual(task[0].taken_until, res[0].taken_until);
      });
    });

    suite('expire_tasks', function() {
      helper.dbTest('no expired tasks', async function(db) {
        await create(db);
        const res = await db.fns.expire_tasks(new Date());
        assert.equal(res[0].expire_tasks, 0);
      });

      helper.dbTest('expired task gets deleted, counted', async function(db) {
        await create(db, {expires: taskcluster.fromNow('-1 hour')});
        const res = await db.fns.expire_tasks(new Date());
        assert.equal(res[0].expire_tasks, 1);
        const task = await db.fns.get_task(taskId);
        assert.equal(task.length, 0);
      });
    });
  });

  suite('queue_workers', function() {
    setup('reset tables', async function() {
      await helper.withDbClient(async client => {
        await client.query('truncate queue_workers');
      });
    });

    const quarantineUntil = taskcluster.fromNow('-2 hours');
    const expires = taskcluster.fromNow('2 hours');
    const firstClaim = taskcluster.fromNow('0 hours');
    const create = async (db, options = {}) => {
      await db.fns.create_queue_worker(
        options.provisionerId || 'prov',
        options.workerType || 'wt',
        options.workerGroup || 'wg',
        options.workerId || 'wi',
        options.quarantineUntil || quarantineUntil,
        options.expires || expires,
        options.firstClaim || firstClaim,
        options.recentTasks || JSON.stringify([{
          recent: "task",
        }]),
      );
    };

    helper.dbTest('no such queue worker', async function(db) {
      const res = await db.fns.get_queue_worker('prov', 'wt', 'wg', 'wi', new Date());
      assert.deepEqual(res, []);
    });

    helper.dbTest('create_queue_worker / get_queue_worker', async function(db) {
      await create(db);
      const res = await db.fns.get_queue_worker('prov', 'wt', 'wg', 'wi', new Date());
      assert.equal(res[0].provisioner_id, 'prov');
      assert.equal(res[0].worker_type, 'wt');
      assert.equal(res[0].worker_group, 'wg');
      assert.deepEqual(res[0].quarantine_until, quarantineUntil);
      assert.deepEqual(res[0].expires, expires);
      assert.deepEqual(res[0].first_claim, firstClaim);
      assert.deepEqual(res[0].recent_tasks, [{recent: "task"}]);
    });

    helper.dbTest('get_queue_worker doesn\'t return expired workers', async function(db) {
      await create(db, {expires: taskcluster.fromNow('-2 hours')});
      const res = await db.fns.get_queue_worker('prov', 'wt', 'wg', 'wi', new Date());
      assert.deepEqual(res, []);
    });

    helper.dbTest('get_queue_worker returns expired quarantined workers', async function(db) {
      await create(db, {
        expires: taskcluster.fromNow('-2 hours'),
        quarantineUntil: taskcluster.fromNow('2 hours'),
      });
      const res = await db.fns.get_queue_worker('prov', 'wt', 'wg', 'wi', new Date());
      assert.equal(res.length, 1);
    });

    helper.dbTest('get_queue_workers empty', async function(db) {
      const res = await db.fns.get_queue_workers(null, null, null, null, null);
      assert.deepEqual(res, []);
    });

    helper.dbTest('get_queue_workers null options', async function(db) {
      await create(db);
      const res = await db.fns.get_queue_workers(null, null, null, null, null);
      assert.equal(res.length, 1);
    });

    helper.dbTest('get_queue_workers doesn\'t return expired workers', async function(db) {
      await create(db, {expires: taskcluster.fromNow('-2 hours')});
      const res = await db.fns.get_queue_workers(new Date(), null, null, null, null);
      assert.deepEqual(res, []);
    });

    helper.dbTest('get_queue_workers returns expired quarantined workers', async function(db) {
      await create(db, {
        expires: taskcluster.fromNow('-2 hours'),
        quarantineUntil: taskcluster.fromNow('2 hours'),
      });
      const res = await db.fns.get_queue_workers(new Date(), null, null, null, null);
      assert.deepEqual(res, []);
    });

    helper.dbTest('get_queue_workers full results', async function(db) {
      for (let i = 0; i < 10; i++) {
        await create(db, {workerId: `w/${i}`});
      }
      const res = await db.fns.get_queue_workers(null, null, null, null, null);
      assert.equal(res.length, 10);
      assert.equal(res[3].worker_id, 'w/3');
      assert.equal(res[4].worker_id, 'w/4');
      assert.equal(res[5].worker_id, 'w/5');
    });

    helper.dbTest('get_queue_workers with pagination', async function(db) {
      for (let i = 0; i < 10; i++) {
        await create(db, {workerId: `w/${i}`});
      }
      let results = [];
      while (true) {
        const res = await db.fns.get_queue_workers(null, null, null, 2, results.length);
        if (res.length === 0) {
          break;
        }
        results = results.concat(res);
      }

      assert.equal(results.length, 10);
      assert.equal(results[3].worker_id, 'w/3');
      assert.equal(results[4].worker_id, 'w/4');
      assert.equal(results[5].worker_id, 'w/5');
    });

    helper.dbTest('update_queue_worker', async function(db) {
      await create(db);
      const res = await db.fns.update_queue_worker(
        'prov',
        'wt',
        'wg',
        'wi',
        new Date(0),
        new Date(1),
        JSON.stringify([]),
      );
      assert.deepEqual(res[0].quarantine_until, new Date(0));
      assert.deepEqual(res[0].expires, new Date(1));
      assert.deepEqual(res[0].recent_tasks, []);
    });

    helper.dbTest('expire_queue_workers deletes expired workers', async function(db) {
      await create(db, {expires: taskcluster.fromNow('-2 hours')});
      let res = await db.fns.expire_queue_workers(new Date());
      assert.equal(res[0].expire_queue_workers, 1);
      res = await db.fns.get_queue_workers(null, null, null, null, null);
      assert.equal(res.length, 0);
    });

    helper.dbTest('expire_queue_workers doesn\'t delete quarantined expired workers', async function(db) {
      await create(db, {
        expires: taskcluster.fromNow('-2 hours'),
        quarantineUntil: taskcluster.fromNow('2 hours'),
      });
      let res = await db.fns.expire_queue_workers(new Date());
      assert.equal(res[0].expire_queue_workers, 0);
      res = await db.fns.get_queue_workers(null, null, null, null, null);
      assert.equal(res.length, 1);
    });
  });

  suite('queue_worker_types', function() {
    setup('reset tables', async function() {
      await helper.withDbClient(async client => {
        await client.query('truncate queue_worker_types');
      });
    });

    const expires = taskcluster.fromNow('2 hours');
    const lastDateActive = taskcluster.fromNow('0 hours');
    const create = async (db, options = {}) => {
      await db.fns.create_queue_worker_type(
        options.provisionerId || 'prov',
        options.workerType || 'wt',
        options.expires || expires,
        options.lastDateActive || lastDateActive,
        options.description || 'desc',
        options.stability || 'unstable',
      );
    };

    helper.dbTest('no such queue worker type', async function(db) {
      const res = await db.fns.get_queue_worker_type('prov', 'wt', new Date());
      assert.deepEqual(res, []);
    });

    helper.dbTest('create_queue_worker_type / get_queue_worker_types', async function(db) {
      await create(db);
      const res = await db.fns.get_queue_worker_types('prov', 'wt', new Date(), null, null);
      assert.equal(res[0].provisioner_id, 'prov');
      assert.equal(res[0].worker_type, 'wt');
      assert.deepEqual(res[0].expires, expires);
      assert.deepEqual(res[0].last_date_active, lastDateActive);
      assert.deepEqual(res[0].description, 'desc');
    });

    helper.dbTest('get_queue_worker_types doesn\'t return expired worker types', async function(db) {
      await create(db, {expires: taskcluster.fromNow('-2 hours')});
      const res = await db.fns.get_queue_worker_types('prov', 'wt', new Date(), null, null);
      assert.deepEqual(res, []);
    });

    helper.dbTest('get_queue_worker_types empty', async function(db) {
      const res = await db.fns.get_queue_worker_types(null, null, null, null, null);
      assert.deepEqual(res, []);
    });

    helper.dbTest('get_queue_worker_types null options', async function(db) {
      await create(db);
      const res = await db.fns.get_queue_worker_types(null, null, null, null, null);
      assert.equal(res.length, 1);
    });

    helper.dbTest('get_queue_worker_types doesn\'t return expired worker types', async function(db) {
      await create(db, {expires: taskcluster.fromNow('-2 hours')});
      const res = await db.fns.get_queue_worker_types(new Date(), null, null, null, null);
      assert.deepEqual(res, []);
    });

    helper.dbTest('get_queue_worker_types full results', async function(db) {
      for (let i = 0; i < 10; i++) {
        await create(db, {workerType: `wt/${i}`});
      }
      const res = await db.fns.get_queue_worker_types(null, null, null, null, null);
      assert.equal(res.length, 10);
      assert.equal(res[3].worker_type, 'wt/3');
      assert.equal(res[4].worker_type, 'wt/4');
      assert.equal(res[5].worker_type, 'wt/5');
    });

    helper.dbTest('get_queue_worker_types with pagination', async function(db) {
      for (let i = 0; i < 10; i++) {
        await create(db, {workerType: `wt/${i}`});
      }
      let result = [];
      while (true) {
        const res = await db.fns.get_queue_worker_types(null, null, null, 2, result.length);
        result = result.concat(res);
        if (res.length === 0) {
          break;
        }
      }
      assert.equal(result.length, 10);
      assert.equal(result[3].worker_type, 'wt/3');
      assert.equal(result[4].worker_type, 'wt/4');
      assert.equal(result[5].worker_type, 'wt/5');
    });

    helper.dbTest('update_queue_worker_type', async function(db) {
      await create(db);
      const res = await db.fns.update_queue_worker_type(
        'prov',
        'wt',
        new Date(0),
        new Date(1),
        'new_desc',
        'more unstable',
      );
      assert.deepEqual(res[0].expires, new Date(0));
      assert.deepEqual(res[0].last_date_active, new Date(1));
      assert.equal(res[0].description, 'new_desc');
    });

    helper.dbTest('expire_queue_worker_types deletes expired worker types', async function(db) {
      await create(db, {expires: taskcluster.fromNow('-2 hours')});
      let res = await db.fns.expire_queue_worker_types(new Date());
      assert.equal(res[0].expire_queue_worker_types, 1);
      res = await db.fns.get_queue_worker_types(null, null, null, null, null);
      assert.equal(res.length, 0);
    });
  });

  suite('queue_provisioners', function() {
    setup('reset tables', async function() {
      await helper.withDbClient(async client => {
        await client.query('truncate queue_provisioners');
      });
    });

    const expires = taskcluster.fromNow('2 hours');
    const lastDateActive = taskcluster.fromNow('0 hours');
    const create = async (db, options = {}) => {
      await db.fns.create_queue_provisioner(
        options.provisionerId || 'prov',
        options.expires || expires,
        options.lastDateActive || lastDateActive,
        options.description || 'desc',
        options.stability || 'unstable',
        options.actions || JSON.stringify([]),
      );
    };

    helper.dbTest('no such queue provisioner', async function(db) {
      const res = await db.fns.get_queue_provisioner('prov', new Date());
      assert.deepEqual(res, []);
    });

    helper.dbTest('create_queue_provisioners / get_queue_provisioners', async function(db) {
      await create(db);
      const res = await db.fns.get_queue_provisioners(new Date(), null, null);
      assert.equal(res[0].provisioner_id, 'prov');
      assert.deepEqual(res[0].expires, expires);
      assert.deepEqual(res[0].last_date_active, lastDateActive);
      assert.deepEqual(res[0].description, 'desc');
    });

    helper.dbTest('get_queue_provisioners doesn\'t return expired provisioner', async function(db) {
      await create(db, {expires: taskcluster.fromNow('-2 hours')});
      const res = await db.fns.get_queue_provisioners(new Date(), null, null);
      assert.deepEqual(res, []);
    });

    helper.dbTest('get_queue_provisioners empty', async function(db) {
      const res = await db.fns.get_queue_provisioners(null, null, null);
      assert.deepEqual(res, []);
    });

    helper.dbTest('get_queue_provisioners null options', async function(db) {
      await create(db);
      const res = await db.fns.get_queue_provisioners(null, null, null);
      assert.equal(res.length, 1);
    });

    helper.dbTest('get_queue_provisioners doesn\'t return expired provisioners', async function(db) {
      await create(db, {expires: taskcluster.fromNow('-2 hours')});
      const res = await db.fns.get_queue_provisioners(new Date(), null, null);
      assert.deepEqual(res, []);
    });

    helper.dbTest('get_queue_provisioners full result', async function(db) {
      for (let i = 0; i < 10; i++) {
        await create(db, {provisionerId: `p/${i}`});
      }
      const res = await db.fns.get_queue_provisioners(null, null, null);
      assert.equal(res.length, 10);
      assert.equal(res[3].provisioner_id, 'p/3');
      assert.equal(res[4].provisioner_id, 'p/4');
      assert.equal(res[5].provisioner_id, 'p/5');
    });

    helper.dbTest('get_queue_provisioners pagination', async function(db) {
      for (let i = 0; i < 10; i++) {
        await create(db, {provisionerId: `p/${i}`});
      }
      let results = [];
      while (true ) {
        const res = await db.fns.get_queue_provisioners(null, 2, results.length);
        results = results.concat(res);
        if (res.length === 0) {
          break;
        }
      }
      assert.equal(results.length, 10);
      assert.equal(results[3].provisioner_id, 'p/3');
      assert.equal(results[4].provisioner_id, 'p/4');
      assert.equal(results[5].provisioner_id, 'p/5');
    });

    helper.dbTest('update_queue_provisioner / get_queue_provisioners', async function(db) {
      await create(db);
      let res = await db.fns.update_queue_provisioner(
        'prov',
        new Date(1),
        new Date(2),
        'new_desc',
        'more unstable',
        JSON.stringify([]),
      );
      assert.deepEqual(res[0].expires, new Date(1));
      assert.deepEqual(res[0].last_date_active, new Date(2));
      assert.equal(res[0].description, 'new_desc');

      res = await db.fns.get_queue_provisioners(new Date(0), null, null);
      assert.deepEqual(res[0].expires, new Date(1));
      assert.deepEqual(res[0].last_date_active, new Date(2));
      assert.equal(res[0].description, 'new_desc');
    });

    helper.dbTest('expire_queue_provisioners deletes expired provisioner', async function(db) {
      await create(db, {expires: taskcluster.fromNow('-2 hours')});
      let res = await db.fns.expire_queue_provisioners(new Date());
      assert.equal(res[0].expire_queue_provisioners, 1);
      res = await db.fns.get_queue_provisioners(null, null, null);
      assert.equal(res.length, 0);
    });
  });
});
