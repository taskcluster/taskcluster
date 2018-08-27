const assert = require('assert');
const taskDefinition = require('./fixtures/task');
const statusMessage = require('./fixtures/task_status');
const jobMessage = require('./fixtures/job_message');
const parseRoute = require('../src/util/route_parser');
const taskcluster = require('taskcluster-client');
const helper = require('./helper');

let task, status, expected, pushInfo;

suite('handle rerun job', () => {
  helper.withLoader();
  helper.withHandler();

  setup(async () => {
    task = JSON.parse(taskDefinition);
    status = JSON.parse(statusMessage);
    expected = JSON.parse(jobMessage);
    pushInfo = parseRoute(task.routes[0]);
  });

  test('valid message - retry', async () => {
    helper.handler.fakeArtifacts['5UMTRzgESFG3Bn8kCBwxxQ/0'] = [];

    status.runId = 1;
    status.status.runs.push(
      {
        runId: 1,
        state: 'pending',
        reasonCreated: 'retry',
        scheduled: '2016-04-15T19:15:00.497Z',
      }
    );

    expected.state = 'completed';
    expected.result = 'fail';
    expected.isRetried = true;
    expected.logs = [];

    await helper.handler.handleTaskRerun(pushInfo, task, status);
    assert.deepEqual(helper.handler.publishedMessages[0].job, expected);
  });
});
