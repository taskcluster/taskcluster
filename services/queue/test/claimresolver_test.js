import debugFactory from 'debug';
const debug = debugFactory('test:claim-work');
import assert from 'assert';
import slugid from 'slugid';
import taskcluster from '@taskcluster/client';
import helper from './helper.js';
import testing from '@taskcluster/lib-testing';
import { LEVELS } from '@taskcluster/lib-monitor';

helper.secrets.mockSuite(testing.suiteName(), ['aws'], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withAmazonIPRanges(mock, skipping);
  helper.withPollingServices(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withS3(mock, skipping);
  helper.withServer(mock, skipping);
  helper.resetTables(mock, skipping);

  // Generate random task queue id to use for this test
  const taskQueueId = helper.makeTaskQueueId('no-provisioner-extended-extended');

  const makeTask = (retries) => {
    return {
      taskQueueId,
      priority: "normal",
      retries,
      created: taskcluster.fromNowJSON(),
      deadline: taskcluster.fromNowJSON('30 min'),
      payload: {},
      metadata: {
        name: 'Unit testing task',
        description: 'Task created during unit tests',
        owner: 'jonsafj@mozilla.com',
        source: 'https://github.com/taskcluster/taskcluster-queue',
      },
    };
  };

  let monitor;
  suiteSetup(async function() {
    monitor = await helper.load('monitor');
  });

  const checkMetricExists = async (metricName, labelName, labelValue) => {
    const metrics = await monitor.manager._prometheus.metricsJson();
    const metric = metrics.find(({ name }) => name === metricName);
    assert(metric, `${metricName} metric should exist`);
    const labelEntry = metric.values.find(v => v.labels[labelName] === labelValue);
    assert(labelEntry, `${metricName} should have ${labelName}=${labelValue} label`);
    assert(labelEntry.value >= 1, `${metricName} counter should be incremented for ${labelValue}`);
  };

  test('createTask , claimWork, claim expires, retried', async () => {
    let taskId = slugid.v4();
    let task = makeTask(1);

    await helper.startPollingService('claim-resolver');

    debug('### Creating task', taskId);
    await helper.queue.createTask(taskId, task);
    helper.assertPulseMessage('task-defined');
    helper.assertPulseMessage('task-pending');

    monitor.manager.reset(); // clear the first task-pending message

    debug('### Claim task');
    let r1 = await helper.queue.claimWork(taskQueueId, {
      workerGroup: 'my-worker-group-extended-extended',
      workerId: 'my-worker-extended-extended',
      tasks: 2,
    });
    assert(r1.tasks.length === 1, 'Expected a single task');
    assert(r1.tasks[0].status.taskId === taskId, 'Expected specific taskId');

    debug('### Wait for claim expiration');
    await testing.poll(
      async () => {
        assert.deepEqual(monitor.manager.messages.find(({ Type }) => Type === 'task-pending'), {
          Logger: 'taskcluster.test.claim-resolver',
          Type: 'task-pending',
          Fields: { taskId, runId: 1, v: 1 },
          Severity: LEVELS.notice,
        });
      },
      100, 250);

    await helper.stopPollingService();
  });

  test('createTask , claimWork, claim expires, resolve exception', async () => {
    let taskId = slugid.v4();
    let task = makeTask(0);

    await helper.startPollingService('claim-resolver');

    debug('### Creating task');
    await helper.queue.createTask(taskId, task);
    helper.assertPulseMessage('task-defined');
    helper.assertPulseMessage('task-pending');

    monitor.manager.reset(); // clear the first task-pending message

    debug('### Claim task');
    let r1 = await helper.queue.claimWork(taskQueueId, {
      workerGroup: 'my-worker-group-extended-extended',
      workerId: 'my-worker-extended-extended',
      tasks: 2,
    });
    assert.equal(r1.tasks.length, 1, 'Expected a single task');
    assert(r1.tasks[0].status.taskId === taskId, 'Expected specific taskId');

    debug('### Wait for claim expiration');
    await testing.poll(
      async () => {
        assert.deepEqual(monitor.manager.messages.find(({ Type }) => Type === 'task-exception'), {
          Logger: 'taskcluster.test.claim-resolver',
          Type: 'task-exception',
          Fields: { taskId, runId: 0, v: 1 },
          Severity: LEVELS.notice,
        });
      },
      100, 250);

    await checkMetricExists('queue_exception_tasks', 'reasonResolved', 'claim-expired');

    await helper.stopPollingService();
  });
});
