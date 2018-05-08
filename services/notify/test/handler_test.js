suite('Handler', () => {
  let _ = require('lodash');
  let assert = require('assert');
  let mocha = require('mocha');
  let debug = require('debug')('test');
  let testing = require('taskcluster-lib-testing');
  let sinon = require('sinon');
  let helper = require('./helper');
  let load = require('../src/main');
  let RateLimit = require('../src/ratelimit');

  let publisher;
  let listener;
  let notifier;
  let queue = {};

  mocha.before(async () => {
    publisher = await load('publisher', {profile: 'test', process: 'test'});
    listener = await load('listener', {profile: 'test', process: 'test'});
    // disable periodic purging so that mocha will exit
    rateLimit = new RateLimit({count: 100, time: 100, noPeriodicPurge: true});
    notifier = await load('notifier', {profile: 'test', process: 'test', publisher, rateLimit});
    await load('handler', {profile: 'test', process: 'test', listener, queue, publisher, notifier});
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

  let baseStatus = {
    taskId: 'DKPZPsvvQEiw67Pb3rkdNg',
    provisionerId: 'aws-provisioner-v1',
    workerType: 'gecko-t-win7-32-gpu',
    schedulerId: 'gecko-level-3',
    taskGroupId: 'NA3wajh1SQ-yVPlNUO8OYw',
    deadline: '2017-11-23T20:52:34.298Z',
    expires: '2018-11-22T20:52:34.298Z',
    retriesLeft: 5,
    state: 'completed',
    runs: [
      {
        runId: 0,
        state: 'completed',
        reasonCreated: 'scheduled',
        reasonResolved: 'completed',
        workerGroup: 'us-east-1',
        workerId: 'i-07289601f12347a8b',
        takenUntil: '2017-11-22T22:40:54.604Z',
        scheduled: '2017-11-22T22:20:54.016Z',
        started: '2017-11-22T22:20:54.682Z',
        resolved: '2017-11-22T22:26:48.774Z',
      },
    ],
  };

  ['canceled', 'deadline-exceeded'].forEach(reasonResolved => {
    test(`does not publish for ${reasonResolved}`, async () => {
      let notified = false;
      notifier.pulse = () => { notified = true; };
      try {
        let route = 'test-notify.pulse.notify-test.on-any';
        queue.task = sinon.stub().returns(makeTask([route]));
        const status = _.cloneDeep(baseStatus);
        status.state = 'exception';
        status.runs[0].state = 'exception';
        status.runs[0].reasonResolved = reasonResolved;
        await listener.fakeMessage({
          payload: {status},
          exchange: 'exchange/taskcluster-queue/v1/task-completed',
          routingKey: 'doesnt-matter',
          routes: [route],
        });

        // wait long enough for the promises to resolve..
        await new Promise(resolve => setTimeout(resolve, 100));

        assert.equal(notified, false);
      } finally {
        delete notifier.pulse; // restore to method via prototype
      }
    });
  });

  test('pulse', async () => {
    let published = new Promise(resolve => {
      publisher.once('fakePublish', resolve);
    });

    let route = 'test-notify.pulse.notify-test.on-any';
    queue.task = sinon.stub().returns(makeTask([route]));
    await listener.fakeMessage({
      payload: {
        status: baseStatus,
      },
      exchange: 'exchange/taskcluster-queue/v1/task-completed',
      routingKey: 'doesnt-matter',
      routes: [route],
    });

    const {CCs} = await published;
    assert.deepEqual(CCs, ['route.notify-test']);
  });

  test('email', async () => {
    let result = helper.checkSqsMessage(helper.emailSqsQueueUrl, body => {
      let j = JSON.parse(body.Message);
      assert.deepEqual(j.delivery.recipients, ['success@simulator.amazonses.com']);
    });
    let route = 'test-notify.email.success@simulator.amazonses.com.on-any';
    queue.task = sinon.stub().returns(makeTask([route]));
    await listener.fakeMessage({
      payload: {
        status: baseStatus,
      },
      exchange: 'exchange/taskcluster-queue/v1/task-completed',
      routingKey: 'doesnt-matter',
      routes: [route],
    });
    return result;
  });

  test('irc', async () => {
    let result = helper.checkSqsMessage(helper.sqsQueueUrl, body => {
      assert.equal(body.channel, '#taskcluster-test');
      assert.equal(body.message, 'it worked with taskid DKPZPsvvQEiw67Pb3rkdNg');
    });
    let route = 'test-notify.irc-channel.#taskcluster-test.on-any';
    let task = makeTask([route]);
    task.extra = {notify: {ircChannelMessage: 'it worked with taskid ${status.taskId}'}};
    queue.task = sinon.stub().returns(task);
    listener.fakeMessage({
      payload: {
        status: baseStatus,
      },
      exchange: 'exchange/taskcluster-queue/v1/task-completed',
      routingKey: 'doesnt-matter',
      routes: [route],
    });
    return result;
  });
});
