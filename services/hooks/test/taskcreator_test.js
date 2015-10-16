suite('TaskCreator', function() {
  var assume            = require('assume');
  var taskcreator       = require('../hooks/taskcreator');
  var debug             = require('debug')('test:test_schedule_hooks');
  var helper            = require('./helper');

  this.slow(500);

  // these tests require TaskCluster credentials (for the queue insert)
  if (!helper.hasTcCredentials) {
    this.pending = true;
  }

  var creator = null;
  setup(async () => {
    creator = new taskcreator.TaskCreator({
      credentials: helper.cfg.get('taskcluster:credentials'),
    });
  });

  var createHook = async function(hookGroupId, hookId) {
    return await helper.Hook.create({
      hookGroupId:        hookGroupId,
      hookId:             hookId,
      metadata:           {},
      task:               {},
      bindings:           {},
      deadline:           '1 day',
      expires:            '1 day',
      schedule:           {format: {type: "none"}},
      accessToken:        slugid.v4(),
      nextTaskId:         slugid.v4(),
      nextScheduledDate:  new Date(2000, 0, 0, 0, 0, 0, 0),
    });
  };

  test.skip("firing a real task succeeds", async function() {
    /* Note that this requires the following set up in production TC:
     *  - TC credentials given in cfg.get('taskcluster:credentials')
     *    - with scope `assume:hook-id:tc-tests-hooks/tc-test-hook`
     *  - a role `hook-id:tc-hooks-tests/tc-test-hook` with scopes
     *    - queue:create-task:no-provisioner/test-worker
     *    - jungle:tc-hooks-tests:scope/required/for/task/1
     */
    // TODO: waiting for the ability to create that role
  });
  test("adds a taskId if one is not specified");
  test("fails if task.scopes includes scopes not granted to the role");
  test("fails if the role does not have the proper queue:create-task scope");
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
