const assert = require('assert');
const taskDefinition = require('./fixtures/task');
const statusMessage = require('./fixtures/task_status');
const jobMessage = require('./fixtures/job_message');
const parseRoute = require('../src/util/route_parser');
const taskcluster = require('taskcluster-client');
const helper = require('./helper');

let task, status, expected, pushInfo;

suite('handle running job', () => {
  helper.withLoader();
  helper.withHandler();

  setup(() => {
    task = JSON.parse(taskDefinition);
    status = JSON.parse(statusMessage);
    expected = JSON.parse(jobMessage);
    pushInfo = parseRoute(task.routes[0]);
  });

  test('valid message', async () => {
    helper.handler.fakeArtifacts['5UMTRzgESFG3Bn8kCBwxxQ/0'] = [];

    let scheduled = new Date();
    let started = new Date();
    started.setMinutes(started.getMinutes() + 5);

    status.status.runs[0] = {
      runId: 0,
      state: 'running',
      reasonCreated: 'scheduled',
      scheduled: scheduled.toISOString(),
      started: started.toISOString(),
    };

    expected.state = 'running';
    expected.timeStarted = started.toISOString();

    await helper.handler.handleTaskRunning(pushInfo, task, status);
    assert.deepEqual(helper.handler.publishedMessages[0].job, expected);
  });
});
