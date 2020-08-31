const _ = require('lodash');
const assume = require('assume');
const assert = require('assert');
const helper = require('./helper');
const taskcluster = require('taskcluster-client');
const testing = require('taskcluster-lib-testing');
const { hookUtils } = require('../src/utils');

helper.secrets.mockSuite(testing.suiteName(), [], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withTaskCreator(mock, skipping);
  helper.resetTables(mock, skipping);

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
    scheduler.pollingDelay = 1; // 1 ms

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
        hookGroupId: 'tests',
        metadata: {},
        task: {},
        bindings: [],
        schedule: ['0 0 0 * * *'],
        triggerToken: taskcluster.slugid(),
        triggerSchema: {},
      };

      const mkHook = async ({ hookId, nextScheduledDate }) => {
        const hook = _.defaults({
          hookId,
          nextTaskId: taskcluster.slugid(),
          nextScheduledDate,
        }, hookParams);

        await helper.db.fns.create_hook(
          hook, /* hook_group_id */
          hook.hookId, /* hook_id */
          hook.metadata, /* metadata */
          hook.task, /* task */
          JSON.stringify(hook.bindings), /* bindings */
          JSON.stringify(hook.schedule), /* schedule */
          helper.db.encrypt({ value: Buffer.from(hook.triggerToken, 'utf8') }), /* encrypted_encrypted_trigger_token */
          helper.db.encrypt({ value: Buffer.from(hook.nextTaskId, 'utf8') }), /* encrypted_next_task_id */
          nextScheduledDate, /* next_scheduled_date */
          hook.triggerSchema, /* trigger_schema */
        );
      };
      await mkHook({ hookId: 'futureHook', nextScheduledDate: new Date(4000, 0, 0, 0, 0, 0, 0) });
      await mkHook({ hookId: 'pastHook', nextScheduledDate: new Date(2000, 0, 0, 0, 0, 0, 0) });
      await mkHook({ hookId: 'pastHookNotScheduled', nextScheduledDate: new Date(2000, 0, 0, 0, 0, 0, 0) });
    });

    test('calls handleHook only for past-due hooks', async () => {
      const handled = [];
      scheduler.handleHook = async function(hook) {
        // check that context is set correctly..
        assert.deepEqual(this, scheduler);
        handled.push(hook.hookId);
      };
      await scheduler.poll();
      handled.sort();
      assume(handled).eql(['pastHook', 'pastHookNotScheduled']);
    });
  });

  suite('handleHook method', function() {
    subSkip();
    let hook;

    setup(async () => {
      hook = hookUtils.fromDbRows(
        await helper.db.fns.create_hook(
          'tests', /* hook_group_id */
          'test', /* hook_id */
          {
            owner: 'example@example.com',
            emailOnError: true,
          }, /* metadata */
          {}, /* task */
          JSON.stringify([]), /* bindings */
          JSON.stringify(['0 0 0 * * *']), /* schedule */
          helper.db.encrypt({ value: Buffer.from(taskcluster.slugid(), 'utf8') }), /* encrypted_encrypted_trigger_token */
          helper.db.encrypt({ value: Buffer.from(taskcluster.slugid(), 'utf8') }), /* encrypted_next_task_id */
          new Date(3000, 0, 0, 0, 0, 0, 0), /* next_scheduled_date */
          {}, /* trigger_schema */
        ),
      );
    });

    test('creates a new task and updates nextTaskId, lastFire, nextScheduledDate', async () => {
      let oldTaskId = hook.nextTaskId;
      let oldScheduledDate = hook.nextScheduledDate;

      await scheduler.handleHook(hook);

      let updatedHook = hookUtils.fromDbRows(await helper.db.fns.get_hook('tests', 'test'));

      assume(helper.creator.fireCalls).deep.equals([{
        hookGroupId: 'tests',
        hookId: 'test',
        context: { firedBy: 'schedule' },
        options: {
          taskId: helper.db.decrypt({ value: oldTaskId }).toString('utf8'),
          created: new Date(3000, 0, 0, 0, 0, 0, 0),
          retry: false,
        },
      }]);
      assume(updatedHook.nextTaskId).is.not.equal(oldTaskId);
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

      let updatedHook = hookUtils.fromDbRows(await helper.db.fns.get_hook('tests', 'test'));

      assume(helper.db.decrypt({ value: updatedHook.nextTaskId }).toString('utf8')).is.not.equal(oldTaskId);
      assume(updatedHook.nextScheduledDate).is.not.equal(oldScheduledDate);
    });

    test('on error, an error sending email is handled', async () => {
      helper.creator.shouldFail = {
        statusCode: 499,
      };

      let emailSent = false;
      scheduler.sendFailureEmail = async (hook, err) => { emailSent = true; throw new Error('uhoh'); };

      await scheduler.handleHook(hook);

      assume(emailSent).is.equal(true);

      const monitor = await helper.load('monitor');
      assert.equal(
        monitor.manager.messages.filter(
          ({ Type, Fields }) => Type === 'monitor.error' && Fields.message === 'uhoh',
        ).length,
        1);
      monitor.manager.reset();
    });

    test('on 500 error, no email and nothing changes', async () => {
      let oldTaskId = helper.db.decrypt({ value: hook.nextTaskId }).toString('utf8');
      let oldScheduledDate = hook.nextScheduledDate;

      helper.creator.shouldFail = {
        statusCode: 500,
      };

      let emailSent = false;
      scheduler.sendFailureEmail = async (hook, err) => { emailSent = true; };

      await scheduler.handleHook(hook);

      // no email sent for a 500
      assume(emailSent).is.equal(false);

      let updatedHook = hookUtils.fromDbRows(await helper.db.fns.get_hook('tests', 'test'));

      // nothing got updated..
      assume(helper.db.decrypt({ value: updatedHook.nextTaskId }).toString('utf8')).is.equal(oldTaskId);
      assume(updatedHook.nextScheduledDate).is.deeply.equal(oldScheduledDate);
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

      phrase = 'Taskcluster Automation';
      assume(lastEmail.content.search(phrase)).is.not.equal(-1);
    });

    test('sendFailureEmail warns on denylisted addresses', async () => {
      const notify = await helper.load('notify');
      notify.email = async () => {
        const err = new Error('uhoh');
        err.code = 'DenylistedAddress';
        throw err;
      };

      helper.creator.shouldFail = true;
      await scheduler.handleHook(hook);

      const monitor = await helper.load('monitor');
      assert.equal(
        monitor.manager.messages.filter(
          ({ Type, Fields }) =>
            Type === 'monitor.generic' &&
            Fields.message === 'Hook failure email rejected: example@example.com is denylisted',
        ).length,
        1);
      monitor.manager.reset();
    });
  });
});
