const _ = require('lodash');
const assert = require('assert');
const assume = require('assume');
const Scheduler = require('../src/scheduler');
const debug = require('debug')('test:test_schedule_hooks');
const helper = require('./helper');
const taskcreator = require('../src/taskcreator');
const taskcluster = require('taskcluster-client');

helper.secrets.mockSuite('scheduler_test.js', ['taskcluster'], function(mock, skipping) {
  helper.withHook(mock, skipping);
  helper.withTaskCreator(mock, skipping);

  this.slow(500);

  setup(function() {
    helper.load.cfg('app.scheduler.pollingDelay', 1);
    helper.load.inject('notify', new taskcluster.Notify({
      rootUrl: helper.rootUrl,
      fake: {
        email: email => null,
      },
    }));
  });

  let scheduler = null;
  setup(async () => {
    scheduler = await helper.load('schedulerNoStart');
  });

  teardown(async () => {
    if (scheduler) {
      await scheduler.terminate();
    }
    scheduler = null;
    helper.load.remove('schedulerNoStart'); // so we get a fresh one..
  });

  // work around https://github.com/mochajs/mocha/issues/2819
  const subSkip = () => {
    suiteSetup(function() {
      if (skipping()) {
        this.skip();
      }
    });
  };

  test('calls its poll method in a loop when started', async () => {
    let callCount = 0;
    scheduler.poll = () => { callCount += 1; };
    scheduler.pollingDelay = 1;  // 1 ms

    // run for a while..
    scheduler.start();
    await new Promise(accept => { setTimeout(accept, 5); });

    // verify it polled
    let newCallCount = callCount;
    assume(1).lessThan(newCallCount);
    assume(newCallCount).lessThan(7);

    // terminate and run for a while longer
    scheduler.terminate();
    await new Promise(accept => { setTimeout(accept, 5); });

    // verify it didn't poll any more
    assume(callCount).equals(newCallCount);
  });

  suite('poll method', function() {
    subSkip();
    setup(async () => {
      const hookParams = {
        hookGroupId:        'tests',
        metadata:           {},
        task:               {},
        bindings:           [],
        schedule:           ['0 0 0 * * *'],
        lastFire:           {result: 'no-fire'},
        triggerToken:       taskcluster.slugid(),
        triggerSchema:      {},
      };

      await helper.Hook.create(_.defaults({
        hookId:             'futureHook',
        nextTaskId:         taskcluster.slugid(),
        nextScheduledDate:  new Date(4000, 0, 0, 0, 0, 0, 0),
      }, hookParams));

      await helper.Hook.create(_.defaults({
        hookId:             'pastHook',
        nextTaskId:         taskcluster.slugid(),
        nextScheduledDate:  new Date(2000, 0, 0, 0, 0, 0, 0),
      }, hookParams));

      await helper.Hook.create(_.defaults({
        hookId:             'pastHookNotScheduled',
        nextTaskId:         taskcluster.slugid(),
        schedule:           [],
        nextScheduledDate:  new Date(2000, 0, 0, 0, 0, 0, 0),
      }, hookParams));
    });

    test('calls handleHook only for past-due hooks', async () => {
      const handled = [];
      scheduler.handleHook = async (hook) => handled.push(hook.hookId);
      await scheduler.poll();
      handled.sort();
      assume(handled).eql(['pastHook', 'pastHookNotScheduled']);
    });
  });

  suite('handleHook method', function() {
    subSkip();
    let hook;

    setup(async () => {
      hook = await helper.Hook.create({
        hookGroupId:        'tests',
        hookId:             'test',
        metadata:           {
          owner: 'example@example.com',
          emailOnError: true,
        },
        task:               {},
        bindings:           [],
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

      let updatedHook = await helper.Hook.load({
        hookGroupId: 'tests',
        hookId:      'test',
      }, true);

      assume(helper.creator.fireCalls).deep.equals([{
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
      assume(new Date(updatedHook.lastFire.time) - new Date()).is.approximately(0, 10000); // 10s slop
      assume(updatedHook.nextScheduledDate).is.not.equal(oldScheduledDate);
    });

    test('on error, sends an email and updates nextTaskId, lastFire, nextScheduledDate', async () => {
      let oldTaskId = hook.nextTaskId;
      let oldScheduledDate = hook.nextScheduledDate;

      helper.creator.shouldFail = {
        statusCode: 499,
      };

      let emailSent = false;
      scheduler.sendFailureEmail = async (hook, err) => { emailSent = true; };

      await scheduler.handleHook(hook);

      assume(emailSent).is.equal(true);

      let updatedHook = await helper.Hook.load({
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
      helper.creator.shouldFail = true;
      await scheduler.handleHook(hook);
      
      const notify = await helper.load('notify');
      assume(notify.fakeCalls.email.length).greaterThan(0);
      let lastEmail = notify.fakeCalls.email[0].payload;
      let email = scheduler.createEmail(hook, 'error explanation', 'error explanation');
      assume(lastEmail.address).is.equal(email.address);
      assume(lastEmail.subject).is.equal(email.subject);
      assume(lastEmail.content).exists();

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
