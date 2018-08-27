const assert = require('assert');
const taskDefinition = require('./fixtures/task');
const statusMessage = require('./fixtures/task_status');
const jobMessage = require('./fixtures/job_message');
const parseRoute = require('../src/util/route_parser');
const helper = require('./helper');

let task, status, expected, pushInfo;

suite('handle completed job', () => {
  helper.withLoader();
  helper.withHandler();

  setup(function() {
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
      state: 'completed',
      reasonCreated: 'scheduled',
      scheduled: scheduled.toISOString(),
      started: started.toISOString(),
      resolved: resolved.toISOString(),
    };

    expected.state = 'completed';
    expected.result = 'success';
    expected.timeStarted = started.toISOString();
    expected.timeCompleted = resolved.toISOString();
    expected.logs = [
      {
        name: 'builds-4h',
        url: 'https://queue.taskcluster.net/v1/task/5UMTRzgESFG3Bn8kCBwxxQ/runs/0/artifacts/public/logs/live_backing.log', // eslint-disable-line max-len
      },
    ];

    await helper.handler.handleTaskCompleted(pushInfo, task, status);
    assert.deepEqual(helper.handler.publishedMessages[0].job, expected);
  });
});
