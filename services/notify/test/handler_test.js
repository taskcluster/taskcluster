suite('Handler', () => {
  let assert = require('assert');
  let mocha = require('mocha');
  let debug = require('debug')('test');
  let testing = require('taskcluster-lib-testing');
  let slugid = require('slugid');
  let helper = require('./helper');
  let load = require('../lib/main');

  mocha.before(async () => {
    await load('handler', {profile: 'test', process: 'test'});
  });

  // Create datetime for created and deadline as 25 minutes later
  let created = new Date();
  let deadline = new Date();
  deadline.setMinutes(deadline.getMinutes() + 25);

  let makeTask = function(routes) {
    return {
      provisionerId:    'dummy-test-provisioner',
      workerType:       'dummy-test-worker-type',
      scopes:           [],
      routes:           routes,
      retries:          3,
      created:          created.toJSON(),
      deadline:         deadline.toJSON(),
      payload: {
        desiredResolution:  'success',
      },
      metadata: {
        name:           'Print `"Hello World"` Once',
        description:    'This task will prìnt `"Hello World"` **once**!',
        owner:          'jojensen@mozilla.com', // Because this is stolen from tc-index tests!
        source:         'https://github.com/taskcluster/taskcluster-notify',
      },
      tags: {
        objective:      'Test task notifications',
      },
    };
  };

  test('pulse', async (done) => {
    let taskId = slugid.v4();
    await helper.events.listenFor('notification', helper.notifyEvents.notify({}));
    helper.events.waitFor('notification').then(message => {
      assert.deepEqual(message.routes, ['notify-test']);
      done();
    }).catch(done);

    let task = makeTask(['test-notify.pulse.notify-test.on-any']);
    await helper.queue.createTask(taskId, task);
    await helper.queue.claimTask(taskId, 0, {
      workerGroup:  'dummy-test-workergroup',
      workerId:     'dummy-test-worker-id',
    });
    await testing.sleep(100);
    await helper.queue.reportCompleted(taskId, 0);
  });

  test('email', async (done) => {
    let taskId = slugid.v4();
    helper.checkSqsMessage(helper.emailSqsQueueUrl, done, body => {
      let j = JSON.parse(body.Message);
      assert.deepEqual(j.delivery.recipients, ['success@simulator.amazonses.com']);
    });
    let task = makeTask(['test-notify.email.success@simulator.amazonses.com.on-any']);
    await helper.queue.createTask(taskId, task);
    await helper.queue.claimTask(taskId, 0, {
      workerGroup:  'dummy-test-workergroup',
      workerId:     'dummy-test-worker-id',
    });
    await testing.sleep(100);
    await helper.queue.reportCompleted(taskId, 0);
  });

  test('irc', async (done) => {
    let taskId = slugid.v4();
    helper.checkSqsMessage(helper.sqsQueueUrl, done, body => {
      assert.equal(body.channel, '#taskcluster-test');
    });
    let task = makeTask(['test-notify.irc-channel.#taskcluster-test.on-any']);
    await helper.queue.createTask(taskId, task);
    await helper.queue.claimTask(taskId, 0, {
      workerGroup:  'dummy-test-workergroup',
      workerId:     'dummy-test-worker-id',
    });
    await testing.sleep(100);
    await helper.queue.reportCompleted(taskId, 0);
  });
});
