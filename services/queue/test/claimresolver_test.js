const debug = require('debug')('test:claim-work');
const assert = require('assert');
const slugid = require('slugid');
const taskcluster = require('taskcluster-client');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');
const {LEVELS} = require('taskcluster-lib-monitor');

helper.secrets.mockSuite(testing.suiteName(), ['aws', 'db'], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withAmazonIPRanges(mock, skipping);
  helper.withPollingServices(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withS3(mock, skipping);
  helper.withQueueService(mock, skipping);
  helper.withEntities(mock, skipping);
  helper.withServer(mock, skipping);
  helper.resetTables(mock, skipping);

  // Generate random workerType id to use for this test
  const workerType = helper.makeWorkerType();

  const makeTask = (retries) => {
    return {
      provisionerId: 'no-provisioner-extended-extended',
      workerType,
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

  test('createTask , claimWork, claim expires, retried', async () => {
    let taskId = slugid.v4();
    let task = makeTask(1);

    await helper.startPollingService('claim-resolver');

    debug('### Creating task');
    await helper.queue.createTask(taskId, task);
    helper.assertPulseMessage('task-defined');
    helper.assertPulseMessage('task-pending');

    monitor.manager.reset(); // clear the first task-pending message

    debug('### Claim task');
    let r1 = await helper.queue.claimWork('no-provisioner-extended-extended', workerType, {
      workerGroup: 'my-worker-group-extended-extended',
      workerId: 'my-worker-extended-extended',
      tasks: 2,
    });
    assert(r1.tasks.length === 1, 'Expected a single task');
    assert(r1.tasks[0].status.taskId === taskId, 'Expected specific taskId');

    await testing.poll(
      async () => {
        assert.deepEqual(monitor.manager.messages.find(({Type}) => Type === 'task-pending'), {
          Logger: 'taskcluster.test.claim-resolver',
          Type: 'task-pending',
          Fields: {taskId, runId: 1, v: 1},
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
    let r1 = await helper.queue.claimWork('no-provisioner-extended-extended', workerType, {
      workerGroup: 'my-worker-group-extended-extended',
      workerId: 'my-worker-extended-extended',
      tasks: 2,
    });
    assert(r1.tasks.length === 1, 'Expected a single task');
    assert(r1.tasks[0].status.taskId === taskId, 'Expected specific taskId');

    await testing.poll(
      async () => {
        assert.deepEqual(monitor.manager.messages.find(({Type}) => Type === 'task-exception'), {
          Logger: 'taskcluster.test.claim-resolver',
          Type: 'task-exception',
          Fields: {taskId, runId: 0, v: 1},
          Severity: LEVELS.notice,
        });
      },
      100, 250);

    await helper.stopPollingService();
  });
});
