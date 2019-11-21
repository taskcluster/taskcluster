const _ = require('lodash');
const debug = require('debug')('test:cancel');
const slugid = require('slugid');
const taskcluster = require('taskcluster-client');
const assume = require('assume');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');

helper.secrets.mockSuite(testing.suiteName(), ['aws', 'azure'], function(mock, skipping) {
  helper.withAmazonIPRanges(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withS3(mock, skipping);
  helper.withQueueService(mock, skipping);
  helper.withEntities(mock, skipping);
  helper.withServer(mock, skipping);

  // Use the same task definition for everything
  const taskDef = {
    provisionerId: 'no-provisioner-extended-extended',
    workerType: 'test-worker-extended-extended',
    schedulerId: 'my-scheduler-extended-extended',
    taskGroupId: 'dSlITZ4yQgmvxxAi4A8fHQ',
    routes: [],
    retries: 5,
    created: taskcluster.fromNowJSON(),
    deadline: taskcluster.fromNowJSON('3 days'),
    scopes: [],
    payload: {},
    metadata: {
      name: 'Unit testing task',
      description: 'Task created during unit tests',
      owner: 'jonsafj@mozilla.com',
      source: 'https://github.com/taskcluster/taskcluster-queue',
    },
    tags: {
      purpose: 'taskcluster-testing',
    },
  };

  test('defineTask, cancelTask (idempotent)', async () => {
    const taskId = slugid.v4();

    debug('### Define task');
    const r1 = await helper.queue.defineTask(taskId, taskDef);
    assume(r1.status.state).equals('unscheduled');
    helper.assertPulseMessage('task-defined', m => m.payload.status.taskId === taskId);

    debug('### Cancel Task');
    const r2 = await helper.queue.cancelTask(taskId);
    assume(r2.status.state).equals('exception');
    assume(r2.status.runs.length).equals(1);
    assume(r2.status.runs[0].state).equals('exception');
    assume(r2.status.runs[0].reasonCreated).equals('exception');
    assume(r2.status.runs[0].reasonResolved).equals('canceled');

    helper.assertPulseMessage('task-exception', m => _.isEqual(m.payload.status, r2.status));
    helper.clearPulseMessages();

    debug('### Cancel Task (again)');
    const r3 = await helper.queue.cancelTask(taskId);
    assume(r3.status).deep.equals(r2.status);
    // exception message is sent again..
    helper.assertPulseMessage('task-exception', m => _.isEqual(m.payload.status, r2.status));
  });

  test('createTask, cancelTask (idempotent)', async () => {
    const taskId = slugid.v4();

    debug('### Create task');
    const r1 = await helper.queue.createTask(taskId, taskDef);
    assume(r1.status.state).equals('pending');
    assume(r1.status.runs.length).equals(1);
    assume(r1.status.runs[0].state).equals('pending');
    helper.assertPulseMessage('task-defined');
    helper.assertPulseMessage('task-pending');

    debug('### Cancel Task');
    const r2 = await helper.queue.cancelTask(taskId);
    assume(r2.status.state).equals('exception');
    assume(r2.status.runs.length).equals(1);
    assume(r2.status.runs[0].state).equals('exception');
    assume(r2.status.runs[0].reasonCreated).equals('scheduled');
    assume(r2.status.runs[0].reasonResolved).equals('canceled');
    helper.assertPulseMessage('task-exception', m => _.isEqual(m.payload.status, r2.status));
    helper.clearPulseMessages();

    debug('### Cancel Task (again)');
    const r3 = await helper.queue.cancelTask(taskId);
    assume(r3.status).deep.equals(r2.status);
    helper.assertPulseMessage('task-exception', m => _.isEqual(m.payload.status, r2.status));
  });

  test('createTask, claimTask, cancelTask (idempotent)', async () => {
    const taskId = slugid.v4();

    debug('### Create task');
    const r1 = await helper.queue.createTask(taskId, taskDef);
    assume(r1.status.state).equals('pending');
    assume(r1.status.runs.length).equals(1);
    assume(r1.status.runs[0].state).equals('pending');
    helper.assertPulseMessage('task-defined');
    helper.assertPulseMessage('task-pending');

    debug('### Claim task');
    const r2 = await helper.queue.claimTask(taskId, 0, {
      workerGroup: 'my-worker-group-extended-extended',
      workerId: 'my-worker-extended-extended',
    });
    assume(r2.status.state).equals('running');
    helper.assertPulseMessage('task-running');

    debug('### Cancel Task');
    const r3 = await helper.queue.cancelTask(taskId);
    assume(r3.status.state).equals('exception');
    assume(r3.status.runs.length).equals(1);
    assume(r3.status.runs[0].state).equals('exception');
    assume(r3.status.runs[0].reasonCreated).equals('scheduled');
    assume(r3.status.runs[0].reasonResolved).equals('canceled');
    helper.assertPulseMessage('task-exception', m => _.isEqual(m.payload.status, r3.status));
    helper.clearPulseMessages();

    debug('### Cancel Task (again)');
    const r4 = await helper.queue.cancelTask(taskId);
    assume(r4.status).deep.equals(r3.status);
    helper.assertPulseMessage('task-exception', m => _.isEqual(m.payload.status, r3.status));
  });
});
