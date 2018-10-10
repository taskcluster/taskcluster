const _ = require('lodash');
const assert = require('assert');
const mocha = require('mocha');
const debug = require('debug')('test');
const testing = require('taskcluster-lib-testing');
const sinon = require('sinon');
const helper = require('./helper');
const load = require('../src/main');
const RateLimit = require('../src/ratelimit');

helper.secrets.mockSuite(helper.suiteName(__filename), ['aws'], function(mock, skipping) {
  helper.withFakeQueue(mock, skipping);
  helper.withSES(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withSQS(mock, skipping);
  helper.withHandler(mock, skipping);

  const created = new Date();
  const deadline = new Date();
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
      const route = 'test-notify.pulse.notify-test.on-any';
      helper.queue.addTask(baseStatus.taskId, makeTask([route]));
      const status = _.cloneDeep(baseStatus);
      status.state = 'exception';
      status.runs[0].state = 'exception';
      status.runs[0].reasonResolved = reasonResolved;
      await helper.pq.fakeMessage({
        payload: {status},
        exchange: 'exchange/taskcluster-queue/v1/task-completed',
        routingKey: 'doesnt-matter',
        routes: [route],
      });

      // wait long enough for the promises to resolve..
      await new Promise(resolve => setTimeout(resolve, 100));

      helper.checkNoNextMessage('notification');
    });
  });

  test('pulse', async () => {
    const p = new Promise(resolve => helper.publisher.once('message', resolve));

    const route = 'test-notify.pulse.notify-test.on-any';
    helper.queue.addTask(baseStatus.taskId, makeTask([route]));
    await helper.pq.fakeMessage({
      payload: {
        status: baseStatus,
      },
      exchange: 'exchange/taskcluster-queue/v1/task-completed',
      routingKey: 'doesnt-matter',
      routes: [route],
    });
    await p;
    helper.checkNextMessage('notification', m => assert.deepEqual(m.CCs, ['route.notify-test']));
  });

  test('email', async () => {
    const route = 'test-notify.email.success@simulator.amazonses.com.on-any';
    helper.queue.addTask(baseStatus.taskId, makeTask([route]));
    await helper.handler.onMessage({
      payload: {
        status: baseStatus,
      },
      exchange: 'exchange/taskcluster-queue/v1/task-completed',
      routingKey: 'doesnt-matter',
      routes: [route],
    });
    await helper.checkEmails(email => {
      assert.deepEqual(email.delivery.recipients, ['success@simulator.amazonses.com']);
    });
  });

  test('irc', async () => {
    const route = 'test-notify.irc-channel.#taskcluster-test.on-any';
    const task = makeTask([route]);
    task.extra = {notify: {ircChannelMessage: 'it worked with taskid ${status.taskId}'}};
    helper.queue.addTask(baseStatus.taskId, task);
    await helper.handler.onMessage({
      payload: {
        status: baseStatus,
      },
      exchange: 'exchange/taskcluster-queue/v1/task-completed',
      routingKey: 'doesnt-matter',
      routes: [route],
    });
    await helper.checkSQSMessage(helper.ircSQSQueue, body => {
      assert.equal(body.channel, '#taskcluster-test');
      assert.equal(body.message, 'it worked with taskid DKPZPsvvQEiw67Pb3rkdNg');
    });
  });
});
