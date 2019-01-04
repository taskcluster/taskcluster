const assume = require('assume');
const taskcreator = require('../src/taskcreator');
const debug = require('debug')('test:test_schedule_hooks');
const helper = require('./helper');
const data = require('../src/data');
const {TaskCreator} = require('../src/taskcreator');
const taskcluster = require('taskcluster-client');
const _ = require('lodash');
const hookDef = require('./test_definition');
const libUrls = require('taskcluster-lib-urls');

suite('taskcreator_test.js', function() {
  helper.secrets.mockSuite('TaskCreator', ['taskcluster'], function(mock, skipping) {
    helper.withHook(mock, skipping);
    helper.withLastFire(mock, skipping);

    this.slow(500);

    /* Note that this requires the following set up in production TC:
     *  - TC credentials given in cfg.get('taskcluster:credentials') with
     *    - assume:hook-id:tc-hooks-tests/tc-test-hook
     *    - auth:azure-table-access:jungle/*
     *  - a role `hook-id:tc-hooks-tests/tc-test-hook` with scopes
     *    - queue:create-task:no-provisioner/test-worker
     *    - project:taskcluster:tests:tc-hooks:scope/required/for/task/1
     */

    let creator = null;
    setup(async () => {
      helper.load.remove('taskcreator');
      if (mock) {
        helper.load.cfg('taskcluster.rootUrl', libUrls.testRootUrl());
      }
      creator = await helper.load('taskcreator');
      if (mock) {
        creator.fakeCreate = true;
      }
    });

    const defaultHook = {
      hookGroupId:        'tc-hooks-tests',
      hookId:             'tc-test-hook',
      metadata:           {},
      bindings:           [],
      schedule:           {format: {type: 'none'}},
      triggerToken:       taskcluster.slugid(),
      lastFire:           {},
      nextTaskId:         taskcluster.slugid(),
      nextScheduledDate:  new Date(2000, 0, 0, 0, 0, 0, 0),
      triggerSchema:      {
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
      task:               {
        // use a JSON-e construct at the top level to double-check that this is a
        // JSON-e template and not treated as a task definition
        $if: 'true',
        then: {
          provisionerId: 'no-provisioner',
          workerType: 'test-worker',
          created: {$fromNow: '0 minutes'},
          deadline: {$fromNow: '1 minutes'},
          expires: {$fromNow: '2 minutes'},
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
      return await helper.Hook.create(hook);
    };

    const fetchFiredTask = async taskId => {
      if (mock) {
        // for mock runs, creator was started with fakeCreate, so use that
        assume(creator.lastCreateTask.taskId).equals(taskId);
        return creator.lastCreateTask.task;
      } else {
        // in real runs, ask the queue for the resulting task
        const cfg = await helper.load('cfg');
        const queue = new taskcluster.Queue(cfg.taskcluster);
        return await queue.task(taskId);
      }
    };

    test('firing a real task succeeds', async function() {
      let hook = await createTestHook([], {
        context:'${context}',
        firedBy:'${firedBy}',
      });
      let taskId = taskcluster.slugid();
      let resp = await creator.fire(hook, {context: true, firedBy: 'schedule'}, {taskId});
      if (mock) {
        assume(creator.lastCreateTask.taskId).equals(taskId);
        assume(creator.lastCreateTask.task.workerType).equals(hook.task.then.workerType);
      } else {
        assume(resp.status.taskId).equals(taskId);
        assume(resp.status.workerType).equals(hook.task.then.workerType);
      }
    });

    test('firing a real task with a JSON-e context succeeds', async function() {
      let hook = await createTestHook([], {
        context: {
          valueFromContext: {$eval: 'someValue + 13'},
          flattenedDeep: {$flattenDeep: {$eval: 'numbers'}},
          firedBy: '${firedBy}',
          // and test that taskId is set in the context..
          taskId: '${taskId}',
        },
      });
      let taskId = taskcluster.slugid();
      let resp = await creator.fire(hook, {
        someValue: 42,
        numbers: [1, 2, [3, 4], [[5, 6]]],
        firedBy: 'schedule',
      }, {taskId});
      const task = await fetchFiredTask(taskId);
      assume(taskId).equals(task.taskGroupId); // the default
      assume(task.extra).deeply.equals({
        context: {
          valueFromContext: 55,
          flattenedDeep:[1, 2, 3, 4, 5, 6],
          firedBy: 'schedule',
          taskId,
        },
      });
      assume(new Date(task.deadline) - new Date(task.created)).to.equal(60000);
      assume(new Date(task.expires) - new Date(task.created)).to.equal(120000); 
    });

    test('firing a real task that sets its own task times works', async function() {
      let hook = _.cloneDeep(defaultHook);
      hook.task.then.created = {$fromNow: '0 seconds'};
      hook.task.then.deadline = {$fromNow: '1 minute'};
      hook.task.then.expires = {$fromNow: '2 minutes'};
      await helper.Hook.create(hook);
      let taskId = taskcluster.slugid();
      let resp = await creator.fire(hook, {}, {taskId});

      const task = await fetchFiredTask(taskId);
      assume(new Date(task.deadline) - new Date(task.created)).to.equal(60000);
      assume(new Date(task.expires) - new Date(task.created)).to.equal(120000);
    });

    test('firing a real task that sets its own taskGroupId works', async function() {
      let hook = _.cloneDeep(defaultHook);
      hook.task.then.taskGroupId = taskcluster.slugid();
      await helper.Hook.create(hook);
      let taskId = taskcluster.slugid();
      let resp = await creator.fire(hook, {}, {taskId});

      const task = await fetchFiredTask(taskId);
      assume(task.taskGroupId).equals(hook.task.then.taskGroupId);
    });

    test('firing a real task includes values from context', async function() {
      let hook = await createTestHook([], {
        env: {DUSTIN_LOCATION: '${location}'},
        firedBy: '${firedBy}',
      });
      let taskId = taskcluster.slugid();
      let resp = await creator.fire(hook, {
        location: 'Belo Horizonte, MG',
        firedBy:'schedule',
      }, {taskId});

      const task = await fetchFiredTask(taskId);
      assume(task.extra).deeply.equals({
        env: {DUSTIN_LOCATION: 'Belo Horizonte, MG'},
        firedBy:'schedule',
      });
    });

    test('adds a taskId if one is not specified', async function() {
      let hook = await createTestHook(['project:taskcluster:tests:tc-hooks:scope/required/for/task/1'],
        {context:'${context}'});
      let resp = await creator.fire(hook, {context: true});
      const task = await fetchFiredTask(resp.status.taskId);
      assume(task.workerType).equals(hook.task.then.workerType);
    });

    if (!mock) {
      // this only makes sense with the real queue's scope-checking logic
      test('fails if task.scopes includes scopes not granted to the role', async function() {
        let hook = await createTestHook(['project:taskcluster:tests:tc-hooks:scope/not/in/the/role']);
        await creator.fire(hook, {payload: true}).then(
          () => { throw new Error('Expected an error'); },
          (err) => { debug('Got expected error: %s', err); });
      });
    }

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
      }
      );

      const res = await helper.LastFire.load({
        hookGroupId: hook.hookGroupId,
        hookId: hook.hookId,
        taskId:  hook.nextTaskId,
      });
      assume(res.taskId).equals(hook.nextTaskId);
    });

    test('Fetch two appended lastFire rows independently', async function() {
      let hook = _.cloneDeep(defaultHook);
      let hook2 = _.cloneDeep({...defaultHook, 
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
        }
        ),
        creator.appendLastFire({
          hookId: hook2.hookId,
          hookGroupId: hook2.hookGroupId,
          firedBy: 'test',
          taskId: hook2.nextTaskId,
          taskCreateTime,
          result: 'success',
          error: '',
        }
        )]).catch(() => {});

      const res = await helper.LastFire.load({
        hookGroupId: hook.hookGroupId,
        hookId: hook.hookId,
        taskId:  hook.nextTaskId,
      });

      const res2 = await helper.LastFire.load({
        hookGroupId: hook2.hookGroupId,
        hookId: hook2.hookId,
        taskId:  hook2.nextTaskId,
      });

      assume(res.taskId).not.equals(res2.taskId);
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
      await creator.fire(hook, {p: 1}, {o: 1});
      assume(creator.fireCalls).deep.equals([
        {hookGroupId: 'g', hookId: 'h', context: {p: 1}, options: {o: 1}},
      ]);
    });
  });
});
