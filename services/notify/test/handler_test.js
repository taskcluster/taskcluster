const _ = require('lodash');
const assert = require('assert');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');

helper.secrets.mockSuite(testing.suiteName(), ['db', 'aws'], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withDenier(mock, skipping);
  helper.withFakeQueue(mock, skipping);
  helper.withFakeMatrix(mock, skipping);
  helper.withSES(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withServer(mock, skipping);

  const created = new Date();
  const deadline = new Date();
  deadline.setMinutes(deadline.getMinutes() + 25);

  let makeTask = function(routes) {
    return {
      provisionerId: 'dummy-test-provisioner',
      workerType: 'dummy-test-worker-type',
      scopes: [],
      routes: routes,
      retries: 3,
      created: created.toJSON(),
      deadline: deadline.toJSON(),
      payload: {
        desiredResolution: 'success',
      },
      metadata: {
        name: 'Print `"Hello World"` Once',
        description: 'This task will prìnt `"Hello World"` **once**!',
        owner: 'jojensen@mozilla.com', // Because this is stolen from tc-index tests!
        source: 'https://github.com/taskcluster/taskcluster-notify',
      },
      tags: {
        objective: 'Test task notifications',
      },
    };
  };

  let baseStatus = {
    taskId: 'DKPZPsvvQEiw67Pb3rkdNg',
    provisionerId: 'test-provisioner',
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

  let monitor;
  suiteSetup('create handler', async function() {
    if (skipping()) {
      return;
    }

    // load the handler so it listens for pulse messages
    await helper.load('handler');
    monitor = await helper.load('monitor');
  });

  ['canceled', 'deadline-exceeded'].forEach(reasonResolved => {
    test(`does not publish for ${reasonResolved}`, async () => {
      const route = 'test-notify.pulse.notify-test.on-any';
      helper.queue.addTask(baseStatus.taskId, makeTask([route]));
      const status = _.cloneDeep(baseStatus);
      status.state = 'exception';
      status.runs[0].state = 'exception';
      status.runs[0].reasonResolved = reasonResolved;
      await helper.fakePulseMessage({
        payload: {status},
        exchange: 'exchange/taskcluster-queue/v1/task-completed',
        routingKey: 'doesnt-matter',
        routes: [route],
      });

      // wait long enough for the promises to resolve..
      await new Promise(resolve => setTimeout(resolve, 100));

      helper.assertNoPulseMessage('notification');
    });
  });

  test('pulse', async () => {
    const route = 'test-notify.pulse.notify-test.on-any';
    helper.queue.addTask(baseStatus.taskId, makeTask([route]));
    await helper.fakePulseMessage({
      payload: {
        status: baseStatus,
      },
      exchange: 'exchange/taskcluster-queue/v1/task-completed',
      routingKey: 'doesnt-matter',
      routes: [route],
    });
    helper.assertPulseMessage('notification', m => m.CCs[0] === 'route.notify-test');
  });

  test('pulse denylisted', async () => {
    const route = 'test-notify.pulse.notify-test-denied.on-any';
    helper.queue.addTask(baseStatus.taskId, makeTask([route]));
    await helper.fakePulseMessage({
      payload: {
        status: baseStatus,
      },
      exchange: 'exchange/taskcluster-queue/v1/task-completed',
      routingKey: 'doesnt-matter',
      routes: [route],
    });
    helper.assertNoPulseMessage('notification', m => m.CCs[0] === 'route.notify-test');
  });

  test('email', async () => {
    const route = 'test-notify.email.success@simulator.amazonses.com.on-any';
    helper.queue.addTask(baseStatus.taskId, makeTask([route]));
    await helper.fakePulseMessage({
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
    await helper.fakePulseMessage({
      payload: {
        status: baseStatus,
      },
      exchange: 'exchange/taskcluster-queue/v1/task-completed',
      routingKey: 'doesnt-matter',
      routes: [route],
    });
    helper.assertPulseMessage('irc-request', m => {
      const {channel, message} = m.payload;
      return _.isEqual(channel, '#taskcluster-test') &&
      _.isEqual(message, 'it worked with taskid DKPZPsvvQEiw67Pb3rkdNg');
    });
  });

  test('matrix', async () => {
    const route = 'test-notify.matrix-room.!gBxblkbeeBSadzOniu:mozilla.org.on-any';
    const task = makeTask([route]);
    task.extra = {notify: {matrixFormat: 'matrix.foo', matrixBody: '${taskId}', matrixFormattedBody: '<h1>${taskId}</h1>', matrixMsgtype: 'm.text'}};
    helper.queue.addTask(baseStatus.taskId, task);
    await helper.fakePulseMessage({
      payload: {
        status: baseStatus,
      },
      exchange: 'exchange/taskcluster-queue/v1/task-completed',
      routingKey: 'doesnt-matter',
      routes: [route],
    });
    assert.equal(helper.matrixClient.sendEvent.callCount, 1);
    assert.equal(helper.matrixClient.sendEvent.args[0][0], '!gBxblkbeeBSadzOniu:mozilla.org');
    assert.equal(helper.matrixClient.sendEvent.args[0][2].format, 'matrix.foo');
    assert.equal(helper.matrixClient.sendEvent.args[0][2].body, 'DKPZPsvvQEiw67Pb3rkdNg');
    assert.equal(helper.matrixClient.sendEvent.args[0][2].formatted_body, '<h1>DKPZPsvvQEiw67Pb3rkdNg</h1>');
    assert.equal(helper.matrixClient.sendEvent.args[0][2].msgtype, 'm.text');
    assert(monitor.manager.messages.find(m => m.Type === 'matrix'));
    assert(monitor.manager.messages.find(m => m.Type === 'matrix-forbidden') === undefined);
  });

  test('matrix (default notice)', async () => {
    const route = 'test-notify.matrix-room.!gBxblkbeeBSadzOniu:mozilla.org.on-any';
    const task = makeTask([route]);
    task.extra = {notify: {matrixFormat: 'matrix.foo', matrixBody: '${taskId}', matrixFormattedBody: '<h1>${taskId}</h1>'}};
    helper.queue.addTask(baseStatus.taskId, task);
    await helper.fakePulseMessage({
      payload: {
        status: baseStatus,
      },
      exchange: 'exchange/taskcluster-queue/v1/task-completed',
      routingKey: 'doesnt-matter',
      routes: [route],
    });
    assert.equal(helper.matrixClient.sendEvent.callCount, 1);
    assert.equal(helper.matrixClient.sendEvent.args[0][0], '!gBxblkbeeBSadzOniu:mozilla.org');
    assert.equal(helper.matrixClient.sendEvent.args[0][2].format, 'matrix.foo');
    assert.equal(helper.matrixClient.sendEvent.args[0][2].body, 'DKPZPsvvQEiw67Pb3rkdNg');
    assert.equal(helper.matrixClient.sendEvent.args[0][2].formatted_body, '<h1>DKPZPsvvQEiw67Pb3rkdNg</h1>');
    assert.equal(helper.matrixClient.sendEvent.args[0][2].msgtype, 'm.notice');
    assert(monitor.manager.messages.find(m => m.Type === 'matrix'));
    assert(monitor.manager.messages.find(m => m.Type === 'matrix-forbidden') === undefined);
  });

  test('matrix (rejected)', async () => {
    const route = 'test-notify.matrix-room.!rejected:mozilla.org.on-any';
    const task = makeTask([route]);
    helper.queue.addTask(baseStatus.taskId, task);
    await helper.fakePulseMessage({
      payload: {
        status: baseStatus,
      },
      exchange: 'exchange/taskcluster-queue/v1/task-completed',
      routingKey: 'doesnt-matter',
      routes: [route],
    });
    assert.equal(helper.matrixClient.sendEvent.callCount, 1);
    assert.equal(helper.matrixClient.sendEvent.args[0][0], '!rejected:mozilla.org');
    assert(monitor.manager.messages.find(m => m.Type === 'matrix-forbidden'));
  });
});
