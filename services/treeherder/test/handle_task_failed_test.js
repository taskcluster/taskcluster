import assert from 'assert';
import { Handler } from '../lib/handler';
import { taskDefinition } from './fixtures/task';
import { statusMessage } from './fixtures/task_status';
import { jobMessage } from './fixtures/job_message';
import parseRoute from '../lib/util/route_parser';
import taskcluster from 'taskcluster-client';

let handler, task, status, expected, pushInfo;

suite('handle failed job', () => {
  beforeEach(() => {
    handler = new Handler({prefix: 'treeherder', queue: new taskcluster.Queue()});
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
    started.setMinutes(started.getMinutes() + 5)
    resolved.setMinutes(resolved.getMinutes() + 10)

    status.status.runs[0] = {
      runId: 0,
      state: 'failed',
      reasonCreated: 'scheduled',
      scheduled: scheduled.toISOString(),
      started: started.toISOString(),
      resolved: resolved.toISOString()
    };

    expected.state = 'completed';
    expected.result = 'fail';
    expected.timeStarted = started.toISOString();
    expected.timeCompleted = resolved.toISOString();
    expected.logs = [
      {
        name: "builds-4h",
        url: "https://queue.taskcluster.net/v1/task/5UMTRzgESFG3Bn8kCBwxxQ/runs/0/artifacts/public/logs/live_backing.log"
      }
    ];

    let job = await handler.handleTaskCompleted(pushInfo, task, status);
    assert.deepEqual(actual, expected);
  });
});
