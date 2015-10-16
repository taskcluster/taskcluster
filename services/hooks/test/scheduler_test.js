suite('Scheduler', function() {
  var _                 = require('lodash');
  var assert            = require('assert');
  var assume            = require('assume');
  var Scheduler         = require('../hooks/scheduler');
  var slugid            = require('slugid');
  var debug             = require('debug')('test:test_schedule_hooks');
  var helper            = require('./helper');
  var taskcreator       = require('../hooks/taskcreator');

  this.slow(500);

  // these tests require Azure credentials (for the Hooks table)
  if (!helper.setupApi()) {
    this.pending = true;
  }

  var scheduler = null;
  var creator = null;
  setup(async () => {
    creator = new taskcreator.MockTaskCreator();
    scheduler = new Scheduler({
      Hook: helper.Hook,
      taskcreator: creator,
      pollingDelay: 1
    });
  });

  teardown(async () => {
    if (scheduler) {
      await scheduler.terminate();
    }
    scheduler = null;
  });

  test('calls its poll method in a loop when started', async () => {
    var callCount = 0;
    scheduler.poll = () => { callCount += 1; };
    scheduler.pollingDelay = 1;  // 1 ms

    // run for a while..
    scheduler.start();
    await new Promise((accept) => { setTimeout(accept, 5); });

    // verify it polled
    var newCallCount = callCount;
    assume(1).lessThan(newCallCount);
    assume(newCallCount).lessThan(7);

    // terminate and run for a while longer
    scheduler.terminate();
    await new Promise((accept) => { setTimeout(accept, 5); });

    // verify it didn't poll any more
    assume(callCount).equals(newCallCount);
  });

  suite("poll method", function() {
    setup(async () => {
      await scheduler.Hook.scan({},{handler: hook => {return hook.remove();}});
      var hookParams = {
        hookGroupId:        'tests',
        metadata:           {},
        task:               {},
        bindings:           {},
        deadline:           '1 day',
        expires:            '1 day',
        schedule:           {format: {type: "daily"}},
        accessToken:        slugid.v4(),
      };

      await scheduler.Hook.create(_.defaults({
        hookId:             'futureHook',
        nextTaskId:         slugid.v4(),
        nextScheduledDate:  new Date(3000, 0, 0, 0, 0, 0, 0),
      }, hookParams));

      await scheduler.Hook.create(_.defaults({
        hookId:             'pastHook',
        nextTaskId:         slugid.v4(),
        nextScheduledDate:  new Date(2000, 0, 0, 0, 0, 0, 0),
      }, hookParams));

      await scheduler.Hook.create(_.defaults({
        hookId:             'pastHookNotScheduled',
        nextTaskId:         slugid.v4(),
        schedule:           {format: {type: "none"}},
        nextScheduledDate:  new Date(2000, 0, 0, 0, 0, 0, 0),
      }, hookParams));
    });

    test('calls handleHook only for past-due hooks', async () => {
      var handled = [];
      scheduler.handleHook = async (hook) => { handled.push(hook.hookId) };
      await scheduler.poll();
      assume(handled).eql(['pastHook']);
    });
  });

  suite("handleHook method", function() {
    var hook;

    setup(async () => {
      await scheduler.Hook.scan({},{handler: hook => {return hook.remove();}});

      hook = await scheduler.Hook.create({
        hookGroupId:        'tests',
        hookId:             'test',
        metadata:           {},
        task:               {
          provisionerId: 'no-provisioner',
          workerType: 'test-worker',
          metadata: {
            name: 'test task',
            description: 'task created by tc-hooks tests',
            owner: 'taskcluster@mozilla.com',
            source: 'http://taskcluster.net',
          },
          payload: {},
        },
        bindings:           {},
        deadline:           '1 day',
        expires:            '1 day',
        schedule:           {format: {type: "daily", timeOfDay: [1]}},
        accessToken:        slugid.v4(),
        nextTaskId:         slugid.v4(),
        nextScheduledDate:  new Date(3000, 0, 0, 0, 0, 0, 0),
      });
    });

    test('creates a new task and updates the taskId and nextScheduledDate', async () => {
      let oldTaskId = hook.nextTaskId;
      let oldScheduledDate = hook.nextScheduledDate;

      await scheduler.handleHook(hook);

      let updatedHook = await scheduler.Hook.load({
          hookGroupId: 'tests',
          hookId:      'test'
      }, true);

      assume(creator.fireCalls).deep.equals([{
          hookGroupId: 'tests',
          hookId: 'test',
          payload: {},
          options: {taskId: oldTaskId}
        }]);
      assume(updatedHook.nextTaskId).is.not.equal(oldTaskId);
      assume(updatedHook.nextScheduledDate).is.not.equal(oldScheduledDate);
    });
  });
});
