const assert = require('assert');
const taskDefinition = require('./fixtures/task');
const statusMessage = require('./fixtures/task_status');
const jobMessage = require('./fixtures/job_message');
const parseRoute = require('../src/util/route_parser');
const taskcluster = require('taskcluster-client');
const helper = require('./helper');

let task, status, expected, pushInfo;

suite('handle exception job', () => {
  helper.withLoader();
  helper.withHandler();

  setup(async () => {
    task = JSON.parse(taskDefinition);
    status = JSON.parse(statusMessage);
    expected = JSON.parse(jobMessage);
    pushInfo = parseRoute(task.routes[0]);
  });

  test('valid message', async () => {
    helper.handler.fakeArtifacts['5UMTRzgESFG3Bn8kCBwxxQ/0'] = [];

    let scheduled = new Date();
    let started = new Date();
    let resolved = new Date();
    started.setMinutes(started.getMinutes() + 5);
    resolved.setMinutes(resolved.getMinutes() + 10);

    status.status.runs[0] = {
      runId: 0,
      state: 'exception',
      reasonCreated: 'scheduled',
      scheduled: scheduled.toISOString(),
      started: started.toISOString(),
      resolved: resolved.toISOString(),
    };

    expected.state = 'completed';
    expected.result = 'exception';
    expected.timeStarted = started.toISOString();
    expected.timeCompleted = resolved.toISOString();
    expected.logs = [];

    await helper.handler.handleTaskException(pushInfo, task, status);
    assert.deepEqual(helper.handler.publishedMessages[0].job, expected);
  });

  test('superseded message', async () => {
    helper.handler.fakeArtifacts['5UMTRzgESFG3Bn8kCBwxxQ/0'] = [];

    let scheduled = new Date();
    let started = new Date();
    let resolved = new Date();
    started.setMinutes(started.getMinutes() + 5);
    resolved.setMinutes(resolved.getMinutes() + 10);

    status.status.runs[0] = {
      runId: 0,
      state: 'exception',
      reasonCreated: 'scheduled',
      reasonResolved: 'superseded',
      scheduled: scheduled.toISOString(),
      started: started.toISOString(),
      resolved: resolved.toISOString(),
    };

    expected.state = 'completed';
    expected.result = 'superseded';
    expected.timeStarted = started.toISOString();
    expected.timeCompleted = resolved.toISOString();
    expected.logs = [];

    await helper.handler.handleTaskException(pushInfo, task, status);
    assert.deepEqual(helper.handler.publishedMessages[0].job, expected);
  });

  test('do not publish when reason created is exception', async () => {
    helper.handler.fakeArtifacts['5UMTRzgESFG3Bn8kCBwxxQ/0'] = [];

    let scheduled = new Date();
    let started = new Date();
    let resolved = new Date();
    started.setMinutes(started.getMinutes() + 5);
    resolved.setMinutes(resolved.getMinutes() + 10);

    status.status.runs[0] = {
      runId: 0,
      state: 'exception',
      reasonCreated: 'exception',
      scheduled: scheduled.toISOString(),
      started: started.toISOString(),
      resolved: resolved.toISOString(),
    };

    expected.logs = [];

    await helper.handler.handleTaskException(pushInfo, task, status);
    assert.equal(helper.handler.publishedMessages.length, 0);
  });
});
