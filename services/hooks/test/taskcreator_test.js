suite('TaskCreator', function() {
  var assume            = require('assume');
  var taskcreator       = require('../src/taskcreator');
  var debug             = require('debug')('test:test_schedule_hooks');
  var helper            = require('./helper');
  var data              = require('../src/data');
  var taskcluster       = require('taskcluster-client');

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

  var createTestHook = async function(scopes, extra) {
    return await helper.Hook.create({
      hookGroupId:        'tc-hooks-tests',
      hookId:             'tc-test-hook',
      metadata:           {},
      task:               {
        provisionerId:    'no-provisioner',
        workerType:       'test-worker',
        schedulerId:      'my-scheduler',
        taskGroupId:      'dSlITZ4yQgmvxxAi4A8fHQ',
        scopes:           scopes,
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
        extra,
      },
      bindings:           [],
      deadline:           '1 day',
      expires:            '1 day',
      schedule:           {format: {type: 'none'}},
      triggerToken:       taskcluster.slugid(),
      lastFire:           {},
      nextTaskId:         taskcluster.slugid(),
      nextScheduledDate:  new Date(2000, 0, 0, 0, 0, 0, 0),
      triggerSchema:      {type: 'object', properties:{location:{type: 'string', default: 'Niskayuna, NY'}, 
        otherVariable: {type: 'integer', default: '12'}}, additionalProperties: false},
    });
  };

  test('firing a real task succeeds', async function() {
    let hook = await createTestHook([], {context:'${context}', triggeredBy:'${triggeredBy}'});
    let taskId = taskcluster.slugid();
    let resp = await creator.fire(hook, {context: true, triggeredBy: 'schedule'}, {taskId});
    assume(resp.status.taskId).equals(taskId);
    assume(resp.status.workerType).equals(hook.task.workerType);
  });

  test('firing a real task with a JSON-e context succeeds', async function() {
    let hook = await createTestHook([], {context:{
      valueFromContext: {$eval: 'someValue + 13'},
      flattenedDeep: {$flattenDeep: {$eval: 'numbers'}}, 
      triggeredBy: '${triggeredBy}'},
    }); 
    let taskId = taskcluster.slugid();
    let resp = await creator.fire(hook, {
      someValue: 42, 
      numbers: [1, 2, [3, 4], [[5, 6]]],
      triggeredBy: 'schedule',
    }, {taskId});
    let queue = new taskcluster.Queue({credentials: helper.cfg.taskcluster.credentials});
    let task = await queue.task(taskId);
    assume(task.extra).deeply.equals({
      context: {valueFromContext: 55, flattenedDeep:[1, 2, 3, 4, 5, 6], triggeredBy: 'schedule'},
    });
  });   

  test('triggerSchema', async function() {
    let hook = await createTestHook([], {
      env: {DUSTIN_LOCATION: '${location}'},
      triggeredBy: '${triggeredBy}',
    }); 
    let taskId = taskcluster.slugid();
    let resp = await creator.fire(hook, {
      location: 'Belo Horizonte, MG',
      triggeredBy:'schedule',
    }, {taskId});
    let queue = new taskcluster.Queue({credentials: helper.cfg.taskcluster.credentials});
    let task = await queue.task(taskId);
    assume(task.extra).deeply.equals({
      env: {DUSTIN_LOCATION: 'Belo Horizonte, MG'},
      triggeredBy:'schedule',
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
      {hookGroupId: 'g', hookId: 'h', payload: {p: 1}, options: {o: 1}},
    ]);
  });
});
