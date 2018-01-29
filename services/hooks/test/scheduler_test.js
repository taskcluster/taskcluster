suite('Scheduler', function() {
  var _                 = require('lodash');
  var assert            = require('assert');
  var assume            = require('assume');
  var Scheduler         = require('../src/scheduler');
  var debug             = require('debug')('test:test_schedule_hooks');
  var helper            = require('./helper');
  var taskcreator       = require('../src/taskcreator');
  var taskcluster       = require('taskcluster-client');

  this.slow(500);
  helper.setup();

  var scheduler = null;
  var creator = null;
  setup(async () => {
    creator = new taskcreator.MockTaskCreator();
    let notify = require('./fake-notify');
    scheduler = new Scheduler({
      Hook: helper.Hook,
      taskcreator: creator,
      pollingDelay: 1,
      notify: notify,
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

  suite('poll method', function() {
    setup(async () => {
      await scheduler.Hook.scan({}, {handler: hook => {return hook.remove();}});
      var hookParams = {
        hookGroupId:        'tests',
        metadata:           {},
        task:               {},
        bindings:           [],
        deadline:           '1 day',
        expires:            '1 day',
        schedule:           ['0 0 0 * * *'],
        lastFire:           {result: 'no-fire'},
        triggerToken:       taskcluster.slugid(),
        triggerSchema:      {},
      };

      await scheduler.Hook.create(_.defaults({
        hookId:             'futureHook',
        nextTaskId:         taskcluster.slugid(),
        nextScheduledDate:  new Date(4000, 0, 0, 0, 0, 0, 0),
      }, hookParams));

      await scheduler.Hook.create(_.defaults({
        hookId:             'pastHook',
        nextTaskId:         taskcluster.slugid(),
        nextScheduledDate:  new Date(2000, 0, 0, 0, 0, 0, 0),
      }, hookParams));

      await scheduler.Hook.create(_.defaults({
        hookId:             'pastHookNotScheduled',
        nextTaskId:         taskcluster.slugid(),
        schedule:           [],
        nextScheduledDate:  new Date(4000, 0, 0, 0, 0, 0, 0),
      }, hookParams));
    });

    test('calls handleHook only for past-due hooks', async () => {
      var handled = [];
      scheduler.handleHook = async (hook) => handled.push(hook.hookId);
      await scheduler.poll();
      assume(handled).eql(['pastHook']);
    });
  });

  suite('handleHook method', function() {
    var hook;

    setup(async () => {
      await scheduler.Hook.scan({}, {handler: hook => {return hook.remove();}});

      hook = await scheduler.Hook.create({
        hookGroupId:        'tests',
        hookId:             'test',
        metadata:           {
          owner: 'example@example.com',
          emailOnError: true,
        },
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
        bindings:           [],
        deadline:           '1 day',
        expires:            '1 day',
        schedule:           ['0 0 0 * * *'],
        triggerToken:       taskcluster.slugid(),
        lastFire:           {result: 'no-fire'},
        nextTaskId:         taskcluster.slugid(),
        nextScheduledDate:  new Date(3000, 0, 0, 0, 0, 0, 0),
        triggerSchema:      {},
      });
    });

    test('creates a new task and updates nextTaskId, lastFire, nextScheduledDate', async () => {
      let oldTaskId = hook.nextTaskId;
      let oldScheduledDate = hook.nextScheduledDate;

      await scheduler.handleHook(hook);

      let updatedHook = await scheduler.Hook.load({
        hookGroupId: 'tests',
        hookId:      'test',
      }, true);

      assume(creator.fireCalls).deep.equals([{
        hookGroupId: 'tests',
        hookId: 'test',
        context: {firedBy: 'schedule'},
        options: {
          taskId: oldTaskId,
          created: new Date(3000, 0, 0, 0, 0, 0, 0),
          retry: false,
        },
      }]);
      assume(updatedHook.nextTaskId).is.not.equal(oldTaskId);
      assume(updatedHook.lastFire.result).is.equal('success');
      assume(updatedHook.lastFire.taskId).is.equal(oldTaskId);
      assume(new Date(updatedHook.lastFire.time) - new Date()).is.approximately(0, 2000); // 2s slop
      assume(updatedHook.nextScheduledDate).is.not.equal(oldScheduledDate);
    });

    test('on error, sends an email and updates nextTaskId, lastFire, nextScheduledDate', async () => {
      let oldTaskId = hook.nextTaskId;
      let oldScheduledDate = hook.nextScheduledDate;

      creator.shouldFail = true;

      let emailSent = false;
      scheduler.sendFailureEmail = async (hook, err) => { emailSent = true; };

      await scheduler.handleHook(hook);

      assume(emailSent).is.equal(true);

      let updatedHook = await scheduler.Hook.load({
        hookGroupId: 'tests',
        hookId:      'test',
      }, true);

      assume(updatedHook.nextTaskId).is.not.equal(oldTaskId);
      assume(updatedHook.lastFire.result).is.equal('error');
      assume(updatedHook.lastFire.error.statusCode).is.equal(499);
      assume(new Date(updatedHook.lastFire.time) - new Date()).is.approximately(0, 2000); // 2s slop
      assume(updatedHook.nextScheduledDate).is.not.equal(oldScheduledDate);
    });

    test('on error, notify is used with correct options', async () => {
      creator.shouldFail = true;
      await scheduler.handleHook(hook);
      
      assume(scheduler.notify.lastEmail).exists();
      let lastEmail = scheduler.notify.lastEmail;
      let email = scheduler.createEmail(hook, 'error explanation', 'error explanation');
      assume(lastEmail.address).is.equal(email.address);
      assume(lastEmail.subject).is.equal(email.subject);

      // validating content of email
      let phrase = `The hooks service was unable to create a task for hook ${hook.hookGroupId}/${hook.hookId}`;
      assume(lastEmail.content.search(phrase)).is.not.equal(-1);

      phrase = 'The error was:';
      assume(lastEmail.content.search(phrase)).is.not.equal(-1);

      phrase = 'Details:';
      assume(lastEmail.content.search(phrase)).is.not.equal(-1);

      phrase = 'TaskCluster Automation';
      assume(lastEmail.content.search(phrase)).is.not.equal(-1);
    });
  });
});
