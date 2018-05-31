const assert = require('assert');
const Handler = require('../src/handler');
const taskDefinition = require('./fixtures/task');
const statusMessage = require('./fixtures/task_status');
const jobMessage = require('./fixtures/job_message');
const parseRoute = require('../src/util/route_parser');
const Monitor = require('taskcluster-lib-monitor');
const taskcluster = require('taskcluster-client');

let handler, task, status, expected, pushInfo;

suite('handle rerun job', () => {
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

  test('valid message - retry', async () => {
    let actual;
    handler.publishJobMessage = (pushInfo, jobMessage) => {
      actual = jobMessage;
    };

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

    let job = await handler.handleTaskRerun(pushInfo, task, status);
    assert.deepEqual(actual, expected);
  });
});
