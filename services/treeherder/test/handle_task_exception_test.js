const assert = require('assert');
const Handler = require('../src/handler');
const taskDefinition = require('./fixtures/task');
const statusMessage = require('./fixtures/task_status');
const jobMessage = require('./fixtures/job_message');
const parseRoute = require('../src/util/route_parser');
const Monitor = require('taskcluster-lib-monitor');
const taskcluster = require('taskcluster-client');

let handler, task, status, expected, pushInfo;

suite('handle exception job', () => {
  beforeEach(async () => {
    handler = new Handler({
      prefix: 'treeherder',
      queue: new taskcluster.Queue(),
      monitor: await Monitor({
        project: 'tc-treeherder-test',
        credentials: {},
        mock: true,
      }),
    });
    task = JSON.parse(taskDefinition);
    status = JSON.parse(statusMessage);
    expected = JSON.parse(jobMessage);
    pushInfo = parseRoute(task.routes[0]);
  });

  test('valid message', async () => {
    let actual;
    handler.publishJobMessage = (pushInfo, job) => {
      actual = job;
    };

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

    let job = await handler.handleTaskException(pushInfo, task, status);
    assert.deepEqual(actual, expected);
  });

  test('superseded message', async () => {
    let actual;
    handler.publishJobMessage = (pushInfo, job) => {
      actual = job;
    };

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

    let job = await handler.handleTaskException(pushInfo, task, status);
    assert.deepEqual(actual, expected);
  });

  test('do not publish when reason created is exception', async () => {
    let actual;
    handler.publishJobMessage = (pushInfo, job) => {
      actual = job;
    };

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

    let job = await handler.handleTaskException(pushInfo, task, status);
    assert.deepEqual(actual, undefined);
  });
});
