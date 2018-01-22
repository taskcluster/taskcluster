import assert from 'assert';
import {Handler} from '../lib/handler';
import {taskDefinition} from './fixtures/task';
import {statusMessage} from './fixtures/task_status';
import {jobMessage} from './fixtures/job_message';
import parseRoute from '../lib/util/route_parser';
import taskcluster from 'taskcluster-client';

let handler, task, status, expected, pushInfo;

suite('handle running job', () => {
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

    let job = await handler.handleTaskRunning(pushInfo, task, status);
    assert.deepEqual(actual, expected);
  });
});
