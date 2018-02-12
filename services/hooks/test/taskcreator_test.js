suite('TaskCreator', function() {
  var assume            = require('assume');
  var taskcreator       = require('../src/taskcreator');
  var debug             = require('debug')('test:test_schedule_hooks');
  var helper            = require('./helper');
  var data              = require('../src/data');
  var taskcluster       = require('taskcluster-client');
  var _                 = require('lodash');

  this.slow(500);
  helper.setup();

  // these tests require real TaskCluster credentials (for the queue insert)
  if (!helper.haveRealCredentials) {
    this.pending = true;
  }

  /* Note that this requires the following set up in production TC:
   *  - TC credentials given in cfg.get('taskcluster:credentials') with
   *    - assume:hook-id:tc-hooks-tests/tc-test-hook
   *    - auth:azure-table-access:jungle/*
   *  - a role `hook-id:tc-hooks-tests/tc-test-hook` with scopes
   *    - queue:create-task:no-provisioner/test-worker
   *    - project:taskcluster:tests:tc-hooks:scope/required/for/task/1
   */

  var creator = null;

  setup(async () => {
    creator = await helper.load('taskcreator', helper.loadOptions);
  });

  var defaultHook = {
    hookGroupId:        'tc-hooks-tests',
    hookId:             'tc-test-hook',
    metadata:           {},
    task:               {
      provisionerId:    'no-provisioner',
      workerType:       'test-worker',
      schedulerId:      'my-scheduler',
      taskGroupId:      'dSlITZ4yQgmvxxAi4A8fHQ',
      scopes:           [],
      payload:          {},
      metadata:         {
        name:           'Unit testing task',
        description:    'Task created during unit tests',
        owner:          'amiyaguchi@mozilla.com',
        source:         'http://github.com/',
      },
      tags: {
        purpose:        'taskcluster-testing',
      },
    },
    bindings:           [],
    deadline:           '1 day',
    expires:            '1 day',
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
  };

  var createTestHook = async function(scopes, extra) {
    let hook = _.cloneDeep(defaultHook);
    hook.task.extra = extra;
    hook.task.scopes = scopes;
    return await helper.Hook.create(hook);
  };

  test('firing a real task succeeds', async function() {
    let hook = await createTestHook([], {context:'${context}', firedBy:'${firedBy}'});
    let taskId = taskcluster.slugid();
    let resp = await creator.fire(hook, {context: true, firedBy: 'schedule'}, {taskId});
    assume(resp.status.taskId).equals(taskId);
    assume(resp.status.workerType).equals(hook.task.workerType);
  });

  test('firing a real task with a JSON-e context succeeds', async function() {
    let hook = await createTestHook([], {context:{
      valueFromContext: {$eval: 'someValue + 13'},
      flattenedDeep: {$flattenDeep: {$eval: 'numbers'}}, 
      firedBy: '${firedBy}'},
    }); 
    let taskId = taskcluster.slugid();
    let resp = await creator.fire(hook, {
      someValue: 42, 
      numbers: [1, 2, [3, 4], [[5, 6]]],
      firedBy: 'schedule',
    }, {taskId});
    let queue = new taskcluster.Queue({credentials: helper.cfg.taskcluster.credentials});
    let task = await queue.task(taskId);
    assume(task.extra).deeply.equals({
      context: {valueFromContext: 55, flattenedDeep:[1, 2, 3, 4, 5, 6], firedBy: 'schedule'},
    });
  });   

  test('firing a real task that sets its own task times works', async function() {
    let hook = _.cloneDeep(defaultHook);
    hook.task.created = {$fromNow: '0 seconds'};
    hook.task.deadline = {$fromNow: '1 minute'};
    hook.task.expires = {$fromNow: '2 minutes'};
    return await helper.Hook.create(hook);
    let taskId = taskcluster.slugid();
    let resp = await creator.fire(hook, {}, {taskId});
    let queue = new taskcluster.Queue({credentials: helper.cfg.taskcluster.credentials});
    let task = await queue.task(taskId);
    assume(new Date(task.expires) - new Date(task.created)).to.equal(60000);
    assume(new Date(task.deadline) - new Date(task.created)).to.equal(120000);
  });

  test('triggerSchema', async function() {
    let hook = await createTestHook([], {
      env: {DUSTIN_LOCATION: '${location}'},
      firedBy: '${firedBy}',
    }); 
    let taskId = taskcluster.slugid();
    let resp = await creator.fire(hook, {
      location: 'Belo Horizonte, MG',
      firedBy:'schedule',
    }, {taskId});
    let queue = new taskcluster.Queue({credentials: helper.cfg.taskcluster.credentials});
    let task = await queue.task(taskId);
    assume(task.extra).deeply.equals({
      env: {DUSTIN_LOCATION: 'Belo Horizonte, MG'},
      firedBy:'schedule',
    });
  });

  test('adds a taskId if one is not specified', async function() {
    let hook = await createTestHook(['project:taskcluster:tests:tc-hooks:scope/required/for/task/1'],
      {context:'${context}'});
    let resp = await creator.fire(hook, {context: true});
    assume(resp.status.workerType).equals(hook.task.workerType);
  });

  test('fails if task.scopes includes scopes not granted to the role', async function() {
    let hook = await createTestHook(['project:taskcluster:tests:tc-hooks:scope/not/in/the/role']);
    await creator.fire(hook, {payload: true}).then(
      () => { throw new Error('Expected an error'); },
      (err) => { debug('Got expected error: %s', err); });
  });
});

suite('MockTaskCreator', function() {
  var assume            = require('assume');
  var taskcreator       = require('../src/taskcreator');
  var debug             = require('debug')('test:test_schedule_hooks');
  var helper            = require('./helper');
  var hookDef           = require('./test_definition');
  var _                 = require('lodash');

  var creator = null;
  setup(async () => {
    creator = new taskcreator.MockTaskCreator();
  });

  test('the fire method records calls', async function() {
    let hook = _.cloneDeep(hookDef);
    hook.hookGroupId = 'g';
    hook.hookId = 'h';
    await creator.fire(hook, {p: 1}, {o: 1});
    assume(creator.fireCalls).deep.equals([
      {hookGroupId: 'g', hookId: 'h', context: {p: 1}, options: {o: 1}},
    ]);
  });
});
