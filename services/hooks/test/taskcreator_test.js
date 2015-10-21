suite('TaskCreator', function() {
  var assume            = require('assume');
  var taskcreator       = require('../hooks/taskcreator');
  var debug             = require('debug')('test:test_schedule_hooks');
  var helper            = require('./helper');
  var data              = require('../hooks/data');
  var taskcluster       = require('taskcluster-client');

  this.slow(500);

  // these tests require TaskCluster credentials (for the queue insert)
  if (!helper.hasTcCredentials || !helper.hasAzureCredentials) {
    this.pending = true;
  }

  /* Note that this requires the following set up in production TC:
   *  - TC credentials given in cfg.get('taskcluster:credentials')
   *    - with scope `assume:hook-id:tc-hooks-tests/tc-test-hook`
   *  - a role `hook-id:tc-hooks-tests/tc-test-hook` with scopes
   *    - queue:create-task:no-provisioner/test-worker
   *    - jungle:tc-hooks-tests:scope/required/for/task/1
   */

  var creator = null;
  var hookDef = require('./test_definition');
  var Hook;

  setup(async () => {
    creator = new taskcreator.TaskCreator({
      credentials: helper.cfg.get('taskcluster:credentials'),
    });

    Hook = data.Hook.setup({
      table:        helper.cfg.get('hooks:hookTableName'),
      credentials:  helper.cfg.get('azure'),
      process:      'testing'
    });
    await Hook.scan({},{handler: hook => {return hook.remove();}});
  });

  var createHook = async function(scopes) {
    return await Hook.create({
      hookGroupId:        "tc-hooks-tests",
      hookId:             "tc-test-hook",
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
          source:         'http://github.com/'
        },
        tags: {
          purpose:        'taskcluster-testing'
        },
      },
      bindings:           [],
      deadline:           '1 day',
      expires:            '1 day',
      schedule:           {format: {type: "none"}},
      triggerToken:       taskcluster.slugid(),
      nextTaskId:         taskcluster.slugid(),
      nextScheduledDate:  new Date(2000, 0, 0, 0, 0, 0, 0),
    });
  };

  test("firing a real task succeeds", async function() {
    let hook = await createHook(['jungle:tc-hooks-tests:scope/required/for/task/1']);
    let taskId = taskcluster.slugid();
    let resp = await creator.fire(hook, {payload: true}, {taskId});
    assume(resp.status.taskId).equals(taskId);
    assume(resp.status.workerType).equals(hook.task.workerType);
  });

  test("adds a taskId if one is not specified", async function() {
    let hook = await createHook(['jungle:tc-hooks-tests:scope/required/for/task/1']);
    let resp = await creator.fire(hook, {payload: true})
    assume(resp.status.workerType).equals(hook.task.workerType);
  });

  test("fails if task.scopes includes scopes not granted to the role", async function() {
    let hook = await createHook(['jungle:tc-hooks-tests:scope/not/in/the/role']);
    await creator.fire(hook, {payload: true}).then(
        () => { throw new Error("Expected an error"); },
        (err) => { debug("Got expected error: %s", err); });
  });
});

suite('MockTaskCreator', function() {
  var assume            = require('assume');
  var taskcreator       = require('../hooks/taskcreator');
  var debug             = require('debug')('test:test_schedule_hooks');
  var helper            = require('./helper');

  var creator = null;
  setup(async () => {
    creator = new taskcreator.MockTaskCreator();
  });

  test("the fire method records calls", async function() {
    creator.fire({hookGroupId: 'g', hookId: 'h'}, {p: 1}, {o: 1});
    assume(creator.fireCalls).deep.equals([
      {hookGroupId: 'g', hookId: 'h', payload: {p: 1}, options: {o: 1}}
    ]);
  });
});
