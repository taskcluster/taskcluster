const debug       = require('debug')('test:cancel');
const assert      = require('assert');
const slugid      = require('slugid');
const _           = require('lodash');
const taskcluster = require('taskcluster-client');
const assume      = require('assume');
const helper      = require('./helper');

helper.secrets.mockSuite(__filename, ['taskcluster', 'aws', 'azure'], function(mock, skipping) {
  helper.withAmazonIPRanges(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withS3(mock, skipping);
  helper.withQueueService(mock, skipping);
  helper.withBlobStore(mock, skipping);
  helper.withEntities(mock, skipping);
  helper.withServer(mock, skipping);

  // Use the same task definition for everything
  const taskDef = {
    provisionerId:    'no-provisioner',
    workerType:       'test-worker',
    schedulerId:      'my-scheduler',
    taskGroupId:      'dSlITZ4yQgmvxxAi4A8fHQ',
    routes:           [],
    retries:          5,
    created:          taskcluster.fromNowJSON(),
    deadline:         taskcluster.fromNowJSON('3 days'),
    scopes:           [],
    payload:          {},
    metadata: {
      name:           'Unit testing task',
      description:    'Task created during unit tests',
      owner:          'jonsafj@mozilla.com',
      source:         'https://github.com/taskcluster/taskcluster-queue',
    },
    tags: {
      purpose:        'taskcluster-testing',
    },
  };

  test('defineTask, cancelTask (idempotent)', async () => {
    const taskId = slugid.v4();

    debug('### Define task');
    const r1 = await helper.queue.defineTask(taskId, taskDef);
    assume(r1.status.state).equals('unscheduled');
    helper.checkNextMessage('task-defined', message => assert(message.payload.status.taskId === taskId));

    debug('### Cancel Task');
    const r2 = await helper.queue.cancelTask(taskId);
    assume(r2.status.state).equals('exception');
    assume(r2.status.runs.length).equals(1);
    assume(r2.status.runs[0].state).equals('exception');
    assume(r2.status.runs[0].reasonCreated).equals('exception');
    assume(r2.status.runs[0].reasonResolved).equals('canceled');

    helper.checkNextMessage('task-exception',
      message => assume(message.payload.status).deep.equals(r2.status));

    debug('### Cancel Task (again)');
    const r3 = await helper.queue.cancelTask(taskId);
    assume(r3.status).deep.equals(r2.status);
    // exception message is sent again..
    helper.checkNextMessage('task-exception',
      message => assume(message.payload.status).deep.equals(r2.status));
    assume(helper.messages).to.deeply.equal([]);
  });

  test('createTask, cancelTask (idempotent)', async () => {
    const taskId = slugid.v4();

    debug('### Create task');
    const r1 = await helper.queue.createTask(taskId, taskDef);
    assume(r1.status.state).equals('pending');
    assume(r1.status.runs.length).equals(1);
    assume(r1.status.runs[0].state).equals('pending');
    helper.checkNextMessage('task-defined');
    helper.checkNextMessage('task-pending');

    debug('### Cancel Task');
    const r2 = await helper.queue.cancelTask(taskId);
    assume(r2.status.state).equals('exception');
    assume(r2.status.runs.length).equals(1);
    assume(r2.status.runs[0].state).equals('exception');
    assume(r2.status.runs[0].reasonCreated).equals('scheduled');
    assume(r2.status.runs[0].reasonResolved).equals('canceled');
    helper.checkNextMessage('task-exception',
      message => assume(message.payload.status).deep.equals(r2.status));

    debug('### Cancel Task (again)');
    const r3 = await helper.queue.cancelTask(taskId);
    assume(r3.status).deep.equals(r2.status);
    helper.checkNextMessage('task-exception',
      message => assume(message.payload.status).deep.equals(r2.status));
    assume(helper.messages).to.deeply.equal([]);
  });

  test('createTask, claimTask, cancelTask (idempotent)', async () => {
    const taskId = slugid.v4();

    debug('### Create task');
    const r1 = await helper.queue.createTask(taskId, taskDef);
    assume(r1.status.state).equals('pending');
    assume(r1.status.runs.length).equals(1);
    assume(r1.status.runs[0].state).equals('pending');
    helper.checkNextMessage('task-defined');
    helper.checkNextMessage('task-pending');

    debug('### Claim task');
    const r2 = await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });
    assume(r2.status.state).equals('running');
    helper.checkNextMessage('task-running');

    debug('### Cancel Task');
    const r3 = await helper.queue.cancelTask(taskId);
    assume(r3.status.state).equals('exception');
    assume(r3.status.runs.length).equals(1);
    assume(r3.status.runs[0].state).equals('exception');
    assume(r3.status.runs[0].reasonCreated).equals('scheduled');
    assume(r3.status.runs[0].reasonResolved).equals('canceled');
    helper.checkNextMessage('task-exception',
      message => assume(message.payload.status).deep.equals(r3.status));

    debug('### Cancel Task (again)');
    const r4 = await helper.queue.cancelTask(taskId);
    assume(r4.status).deep.equals(r3.status);
    helper.checkNextMessage('task-exception',
      message => assume(message.payload.status).deep.equals(r3.status));
    assume(helper.messages).to.deeply.equal([]);
  });
});
