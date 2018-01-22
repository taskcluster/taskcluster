import assert from 'assert';
import {Handler} from '../lib/handler';
import {taskDefinition} from './fixtures/task';
import {statusMessage} from './fixtures/task_status';
import {jobMessage} from './fixtures/job_message';
import parseRoute from '../lib/util/route_parser';
import Monitor from 'taskcluster-lib-monitor';
import taskcluster from 'taskcluster-client';

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
    expected.logs = [
      {
        name: 'builds-4h',
        url: 'https://queue.taskcluster.net/v1/task/5UMTRzgESFG3Bn8kCBwxxQ/runs/0/artifacts/public/logs/live_backing.log', // eslint-disable-line max-len
      },
    ];

    let job = await handler.handleTaskRerun(pushInfo, task, status);
    assert.deepEqual(actual, expected);
  });
});
