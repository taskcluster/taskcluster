const debug = require('debug')('test:deadline');
const assert = require('assert');
const slugid = require('slugid');
const taskcluster = require('taskcluster-client');
const assume = require('assume');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');
const {LEVELS} = require('taskcluster-lib-monitor');

helper.secrets.mockSuite(testing.suiteName(), ['aws', 'db'], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withPollingServices(mock, skipping);
  helper.withAmazonIPRanges(mock, skipping);
  helper.withS3(mock, skipping);
  helper.withQueueService(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withEntities(mock, skipping);
  helper.withServer(mock, skipping);
  helper.resetTables(mock, skipping);

  // Use the same task definition for everything
  const makeTask = () => {
    const task = {
      provisionerId: 'no-provisioner-extended-extended',
      workerType: 'test-worker-extended-extended',
      // Legal because we allow a small bit of clock drift
      created: taskcluster.fromNowJSON('- 5 seconds'),
      deadline: taskcluster.fromNowJSON('5 seconds'),
      retries: 1,
      payload: {},
      metadata: {
        name: 'Unit testing task',
        description: 'Task created during unit tests',
        owner: 'jonsafj@mozilla.com',
        source: 'https://github.com/taskcluster/taskcluster-queue',
      },
    };
    return {taskId: slugid.v4(), task};
  };

  let monitor;
  suiteSetup(async function() {
    monitor = await helper.load('monitor');
  });

  test('Resolve unscheduled task deadline', testing.runWithFakeTime(async () => {
    const {taskId, task} = makeTask();

    // make task self-dependent so that it does not get scheduled
    task.dependencies = [taskId];

    debug('### Create task');
    const r1 = await helper.queue.createTask(taskId, task);
    assume(r1.status.state).equals('unscheduled');
    assume(r1.status.runs.length).equals(0);
    helper.assertPulseMessage('task-defined');

    debug('### Start deadlineReaper');
    await helper.startPollingService('deadline-resolver');

    debug('### Check for task-exception message');
    await testing.poll(async () => {
      helper.assertPulseMessage('task-exception', m => (
        m.payload.status.state === 'exception' &&
        m.payload.status.runs.length === 1 &&
        m.payload.status.runs[0].reasonCreated === 'exception' &&
        m.payload.status.runs[0].reasonResolved === 'deadline-exceeded'));

      assert.deepEqual(monitor.manager.messages.find(({Type}) => Type === 'task-exception'), {
        Type: 'task-exception',
        Logger: 'taskcluster.test.deadline-resolver',
        Fields: {
          v: 1,
          taskId,
          runId: 0,
        },
        Severity: LEVELS.notice,
      });
    }, 100, 250);

    debug('### Stop deadlineReaper');
    await helper.stopPollingService();

    debug('### Validate task status');
    const r2 = await helper.queue.status(taskId);
    assume(r2.status.state).equals('exception');
  }, {mock}));

  test('Resolve pending task deadline', testing.runWithFakeTime(async () => {
    const {taskId, task} = makeTask();

    debug('### Creating task');
    const r1 = await helper.queue.createTask(taskId, task);
    assume(r1.status.state).equals('pending');
    assume(r1.status.runs.length).equals(1);
    helper.assertPulseMessage('task-defined');
    helper.assertPulseMessage('task-pending');

    debug('### Start deadlineReaper');
    await helper.startPollingService('deadline-resolver');
    await testing.poll(async () => {
      helper.assertPulseMessage('task-group-resolved');
      helper.assertPulseMessage('task-exception', m => (
        m.payload.status.state === 'exception' &&
        m.payload.status.runs.length === 1 &&
        m.payload.status.runs[0].reasonCreated === 'scheduled' &&
        m.payload.status.runs[0].reasonResolved === 'deadline-exceeded'));
    }, 20, 1000);

    debug('### Stop deadlineReaper');
    await helper.stopPollingService();

    debug('### Validate task status');
    const r2 = await helper.queue.status(taskId);
    assume(r2.status.state).deep.equals('exception');
  }, {mock}));

  test('Resolve running task deadline', testing.runWithFakeTime(async () => {
    const {taskId, task} = makeTask();

    debug('### Creating task');
    const r1 = await helper.queue.createTask(taskId, task);
    assume(r1.status.state).equals('pending');
    assume(r1.status.runs.length).equals(1);
    helper.assertPulseMessage('task-defined');
    helper.assertPulseMessage('task-pending');

    debug('### Claim task');
    await helper.queue.claimTask(taskId, 0, {
      workerGroup: 'my-worker-group-extended-extended',
      workerId: 'my-worker-extended-extended',
    });
    helper.assertPulseMessage('task-running');

    debug('### Start deadlineReaper');
    await helper.startPollingService('deadline-resolver');
    await testing.poll(async () => {
      helper.assertPulseMessage('task-group-resolved');
      helper.assertPulseMessage('task-exception', m => (
        m.payload.status.state === 'exception' &&
        m.payload.status.runs.length === 1 &&
        m.payload.status.runs[0].reasonCreated === 'scheduled' &&
        m.payload.status.runs[0].reasonResolved === 'deadline-exceeded'));
    }, 20, 1000);

    debug('### Stop deadlineReaper');
    await helper.stopPollingService();

    debug('### Validate task status');
    const r3 = await helper.queue.status(taskId);
    assume(r3.status.state).deep.equals('exception');
  }, {mock}));

  test('Resolve completed task by deadline (no change)', testing.runWithFakeTime(async () => {
    const {taskId, task} = makeTask();

    debug('### Creating task');
    const r1 = await helper.queue.createTask(taskId, task);
    assume(r1.status.state).equals('pending');
    assume(r1.status.runs.length).equals(1);
    helper.assertPulseMessage('task-defined');
    helper.assertPulseMessage('task-pending');

    debug('### Claim task');
    await helper.queue.claimTask(taskId, 0, {
      workerGroup: 'my-worker-group-extended-extended',
      workerId: 'my-worker-extended-extended',
    });
    helper.assertPulseMessage('task-running');

    debug('### Report task completed');
    const r3 = await helper.queue.reportCompleted(taskId, 0);
    helper.assertPulseMessage('task-completed');

    debug('### Start deadlineReaper');
    await helper.startPollingService('deadline-resolver');

    debug('### Ensure that we got no task-exception message');
    await testing.sleep(1000); // give it time to poll
    helper.assertNoPulseMessage('task-exception');

    debug('### Stop deadlineReaper');
    await helper.stopPollingService();

    debug('### Validate task status');
    const r4 = await helper.queue.status(taskId);
    assume(r4.status).deep.equals(r3.status);
  }, {mock}));
});
