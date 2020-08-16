const assert = require('assert');
const assume = require('assume');
const taskcreator = require('../src/taskcreator');
const helper = require('./helper');
const taskcluster = require('taskcluster-client');
const { sleep } = require('taskcluster-lib-testing');
const _ = require('lodash');
const hookDef = require('./test_definition');
const libUrls = require('taskcluster-lib-urls');
const testing = require('taskcluster-lib-testing');
const { hookUtils } = require('../src/utils');

suite(testing.suiteName(), function() {
  helper.secrets.mockSuite('TaskCreator', [], function(mock, skipping) {
    helper.withDb(mock, skipping);
    helper.resetTables(mock, skipping);

    this.slow(500);

    let creator = null;
    setup(async () => {
      await helper.load('cfg');
      helper.load.remove('taskcreator');
      helper.load.cfg('taskcluster.rootUrl', libUrls.testRootUrl());
      creator = await helper.load('taskcreator');
      creator.fakeCreate = true;
    });

    const defaultHook = {
      hookGroupId: 'tc-hooks-tests',
      hookId: 'tc-test-hook',
      metadata: {},
      bindings: [],
      schedule: { format: { type: 'none' } },
      triggerToken: taskcluster.slugid(),
      lastFire: {},
      nextTaskId: taskcluster.slugid(),
      nextScheduledDate: new Date(2000, 0, 0, 0, 0, 0, 0),
      triggerSchema: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            default: 'Niskayuna, NY',
          },
          otherVariable: {
            type: 'integer',
            default: '12',
          },
        },
        additionalProperties: false,
      },
      task: {
        // use a JSON-e construct at the top level to double-check that this is a
        // JSON-e template and not treated as a task definition
        $if: 'true',
        then: {
          provisionerId: 'no-provisioner',
          workerType: 'test-worker',
          created: { $fromNow: '0 minutes' },
          deadline: { $fromNow: '1 minutes' },
          expires: { $fromNow: '2 minutes' },
          metadata: {
            name: 'test task',
            description: 'task created by tc-hooks tests',
            owner: 'taskcluster@mozilla.com',
            source: 'http://taskcluster.net',
          },
          payload: {},
        },
      },
    };

    const createTestHook = async function(scopes, extra) {
      let hook = _.cloneDeep(defaultHook);
      hook.task.then.extra = extra;
      hook.task.then.scopes = scopes;

      return hookUtils.fromDbRows(
        await helper.db.fns.create_hook(
          hook.hookGroupId,
          hook.hookId,
          hook.metadata,
          hook.task,
          JSON.stringify(hook.bindings),
          JSON.stringify(hook.schedule),
          helper.db.encrypt({ value: Buffer.from(hook.triggerToken, 'utf8') }),
          helper.db.encrypt({ value: Buffer.from(hook.nextTaskId, 'utf8') }),
          hook.nextScheduledDate,
          hook.triggerSchema,
        ),
      );
    };

    const fetchFiredTask = async taskId => {
      // for mock runs, creator was started with fakeCreate, so use that
      assume(creator.lastCreateTask.taskId).equals(taskId);
      return creator.lastCreateTask.task;
    };

    const assertNoTask = async taskId => {
      assert(!creator.lastCreateTask);
    };

    const assertFireLogged = fields =>
      assert.deepEqual(
        monitor.manager.messages.find(({ Type }) => Type === 'hook-fire'),
        {
          Fields: {
            hookGroupId: 'tc-hooks-tests',
            hookId: 'tc-test-hook',
            ...fields,
            v: 1,
          },
          Logger: "taskcluster.test.taskcreator",
          Severity: 6,
          Type: "hook-fire",
        });

    let monitor;
    suiteSetup(async function() {
      monitor = await helper.load('monitor');
    });
    test('firing a real task succeeds', async function() {
      let hook = await createTestHook([], {
        context: '${context}',
        firedBy: '${firedBy}',
      });
      let taskId = taskcluster.slugid();
      await creator.fire(hook, { context: true, firedBy: 'schedule' }, { taskId });
      assume(creator.lastCreateTask.taskId).equals(taskId);
      assume(creator.lastCreateTask.task.workerType).equals(hook.task.then.workerType);
      assertFireLogged({ firedBy: "schedule", taskId, result: 'success' });
    });

    test('firing a real task with a JSON-e context succeeds', async function() {
      let hook = await createTestHook([], {
        context: {
          valueFromContext: { $eval: 'someValue + 13' },
          flattenedDeep: { $flattenDeep: { $eval: 'numbers' } },
          firedBy: '${firedBy}',
          // and test that taskId is set in the context..
          taskId: '${taskId}',
        },
      });
      let taskId = taskcluster.slugid();
      await creator.fire(hook, {
        someValue: 42,
        numbers: [1, 2, [3, 4], [[5, 6]]],
        firedBy: 'schedule',
      }, { taskId });
      const task = await fetchFiredTask(taskId);
      assume(taskId).equals(task.taskGroupId); // the default
      assume(task.extra).deeply.equals({
        context: {
          valueFromContext: 55,
          flattenedDeep: [1, 2, 3, 4, 5, 6],
          firedBy: 'schedule',
          taskId,
        },
      });
      assume(new Date(task.deadline) - new Date(task.created)).to.equal(60000);
      assume(new Date(task.expires) - new Date(task.created)).to.equal(120000);
      assertFireLogged({ firedBy: "schedule", taskId, result: 'success' });
    });

    test('firing a hook where the json-e renders to nothing does nothing', async function() {
      const hook = _.cloneDeep(defaultHook);
      hook.task = { $if: 'false', then: hook.task };
      await helper.db.fns.create_hook(
        hook.hookGroupId,
        hook.hookId,
        hook.metadata,
        hook.task,
        JSON.stringify(hook.bindings),
        JSON.stringify(hook.schedule),
        helper.db.encrypt({ value: Buffer.from(hook.triggerToken, 'utf8') }),
        helper.db.encrypt({ value: Buffer.from(hook.nextTaskId, 'utf8') }),
        hook.nextScheduledDate,
        hook.triggerSchema,
      );
      let taskId = taskcluster.slugid();
      await creator.fire(hook, { firedBy: 'schedule' }, { taskId });
      await assertNoTask(taskId);
      assertFireLogged({ firedBy: "schedule", taskId, result: 'declined' });
    });

    test('firing a hook where the json-e fails to render fails', async function() {
      const hook = _.cloneDeep(defaultHook);
      hook.task = { $if: 'uhoh, this is invalid' };
      await helper.db.fns.create_hook(
        hook.hookGroupId,
        hook.hookId,
        hook.metadata,
        hook.task,
        JSON.stringify(hook.bindings),
        JSON.stringify(hook.schedule),
        helper.db.encrypt({ value: Buffer.from(hook.triggerToken, 'utf8') }),
        helper.db.encrypt({ value: Buffer.from(hook.nextTaskId, 'utf8') }),
        hook.nextScheduledDate,
        hook.triggerSchema,
      );
      const taskId = taskcluster.slugid();

      try {
        await creator.fire(hook, { firedBy: 'me' }, { taskId });
      } catch (err) {
        if (!err.toString().match(/SyntaxError/)) {
          throw err;
        }

        const [lf] = await helper.db.fns.get_last_fire(
          hook.hookGroupId,
          hook.hookId,
          taskId,
        );
        assume(lf.result).to.equal('error');
        assume(lf.error).to.match(/SyntaxError/);
        assume(lf.fired_by).to.equal('me');

        assertFireLogged({ firedBy: "me", taskId, result: 'failure' });

        return;
      }
      throw new Error('should have seen an error from .fire');
    });

    test('firing a real task that sets its own task times works', async function() {
      let hook = _.cloneDeep(defaultHook);
      hook.task.then.created = { $fromNow: '0 seconds' };
      hook.task.then.deadline = { $fromNow: '1 minute' };
      hook.task.then.expires = { $fromNow: '2 minutes' };
      await helper.db.fns.create_hook(
        hook.hookGroupId,
        hook.hookId,
        hook.metadata,
        hook.task,
        JSON.stringify(hook.bindings),
        JSON.stringify(hook.schedule),
        helper.db.encrypt({ value: Buffer.from(hook.triggerToken, 'utf8') }),
        helper.db.encrypt({ value: Buffer.from(hook.nextTaskId, 'utf8') }),
        hook.nextScheduledDate,
        hook.triggerSchema,
      );
      let taskId = taskcluster.slugid();
      await creator.fire(hook, { firedBy: 'foo' }, { taskId });

      const task = await fetchFiredTask(taskId);
      assume(new Date(task.deadline) - new Date(task.created)).to.equal(60000);
      assume(new Date(task.expires) - new Date(task.created)).to.equal(120000);
    });

    test('firing a real task that sets its own taskGroupId works', async function() {
      let hook = _.cloneDeep(defaultHook);
      hook.task.then.taskGroupId = taskcluster.slugid();
      await helper.db.fns.create_hook(
        hook.hookGroupId,
        hook.hookId,
        hook.metadata,
        hook.task,
        JSON.stringify(hook.bindings),
        JSON.stringify(hook.schedule),
        helper.db.encrypt({ value: Buffer.from(hook.triggerToken, 'utf8') }),
        helper.db.encrypt({ value: Buffer.from(hook.nextTaskId, 'utf8') }),
        hook.nextScheduledDate,
        hook.triggerSchema,
      );
      let taskId = taskcluster.slugid();
      await creator.fire(hook, { firedBy: 'foo' }, { taskId });

      const task = await fetchFiredTask(taskId);
      assume(task.taskGroupId).equals(hook.task.then.taskGroupId);
    });

    test('firing a task with options.created always generates the same task', async function() {
      await helper.db.fns.create_hook(
        defaultHook.hookGroupId,
        defaultHook.hookId,
        defaultHook.metadata,
        defaultHook.task,
        JSON.stringify(defaultHook.bindings),
        JSON.stringify(defaultHook.schedule),
        helper.db.encrypt({ value: Buffer.from(defaultHook.triggerToken, 'utf8') }),
        helper.db.encrypt({ value: Buffer.from(defaultHook.nextTaskId, 'utf8') }),
        defaultHook.nextScheduledDate,
        defaultHook.triggerSchema,
      );
      const now = new Date();
      const taskIdA = taskcluster.slugid();
      await creator.fire(defaultHook, { firedBy: 'foo' }, { taskId: taskIdA, created: now });
      const taskA = await fetchFiredTask(taskIdA);

      await sleep(10); // ..enough time passes to have different ms timestamps

      const taskIdB = taskcluster.slugid();
      await creator.fire(defaultHook, { firedBy: 'foo' }, { taskId: taskIdB, created: now });
      const taskB = await fetchFiredTask(taskIdB);

      assume(taskA.created).deeply.equal(taskB.created);
      assume(taskA.deadline).deeply.equal(taskB.deadline);
      assume(taskA.expires).deeply.equal(taskB.expires);
    });

    test('firing a real task includes values from context', async function() {
      let hook = await createTestHook([], {
        env: { DUSTIN_LOCATION: '${location}' },
        firedBy: '${firedBy}',
      });
      let taskId = taskcluster.slugid();
      await creator.fire(hook, {
        location: 'Belo Horizonte, MG',
        firedBy: 'schedule',
      }, { taskId });

      const task = await fetchFiredTask(taskId);
      assume(task.extra).deeply.equals({
        env: { DUSTIN_LOCATION: 'Belo Horizonte, MG' },
        firedBy: 'schedule',
      });
    });

    test('adds a taskId if one is not specified', async function() {
      let hook = await createTestHook(['project:taskcluster:tests:tc-hooks:scope/required/for/task/1'],
        { context: '${context}' });
      let resp = await creator.fire(hook, { context: true, firedBy: 'foo' });
      const task = await fetchFiredTask(resp.status.taskId);
      assume(task.workerType).equals(hook.task.then.workerType);
    });

    test('adds a new row to lastFire', async function() {
      let hook = _.cloneDeep(defaultHook);
      let taskCreateTime = new Date();
      await creator.appendLastFire({
        hookId: hook.hookId,
        hookGroupId: hook.hookGroupId,
        firedBy: 'test',
        taskId: hook.nextTaskId,
        taskCreateTime,
        result: 'success',
        error: '',
      },
      );

      const [res] = await helper.db.fns.get_last_fire(
        hook.hookGroupId,
        hook.hookId,
        hook.nextTaskId,
      );
      assume(res.task_id).equals(hook.nextTaskId);
    });

    test('Fetch two appended lastFire rows independently', async function() {
      let hook = _.cloneDeep(defaultHook);
      let hook2 = _.cloneDeep({ ...defaultHook,
        hookId: 'tc-test-hook2',
        nextTaskId: taskcluster.slugid(),
      });
      let taskCreateTime = new Date();
      await Promise.all([
        creator.appendLastFire({
          hookId: hook.hookId,
          hookGroupId: hook.hookGroupId,
          firedBy: 'test',
          taskId: hook.nextTaskId,
          taskCreateTime,
          result: 'success',
          error: '',
        },
        ),
        creator.appendLastFire({
          hookId: hook2.hookId,
          hookGroupId: hook2.hookGroupId,
          firedBy: 'test',
          taskId: hook2.nextTaskId,
          taskCreateTime,
          result: 'success',
          error: '',
        },
        )]).catch(() => {});

      const [res] = await helper.db.fns.get_last_fire(
        hook.hookGroupId,
        hook.hookId,
        hook.nextTaskId,
      );

      const [res2] = await helper.db.fns.get_last_fire(
        hook2.hookGroupId,
        hook2.hookId,
        hook2.nextTaskId,
      );

      assume(res.task_id).not.equals(res2.task_id);
    });
  });

  suite('MockTaskCreator', function() {
    let creator = null;
    setup(async () => {
      creator = new taskcreator.MockTaskCreator();
    });

    test('the fire method records calls', async function() {
      const hook = _.cloneDeep(hookDef);
      hook.hookGroupId = 'g';
      hook.hookId = 'h';
      await creator.fire(hook, { p: 1 }, { o: 1 });
      assume(creator.fireCalls).deep.equals([
        { hookGroupId: 'g', hookId: 'h', context: { p: 1 }, options: { o: 1 } },
      ]);
    });
  });
});
