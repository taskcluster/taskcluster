const debug = require('debug')('test:deadline');
const assert = require('assert');
const slugid = require('slugid');
const _ = require('lodash');
const taskcluster = require('taskcluster-client');
const assume = require('assume');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');

helper.secrets.mockSuite(__filename, ['taskcluster', 'aws', 'azure'], function(mock, skipping) {
  helper.withPollingServices(mock, skipping);
  helper.withAmazonIPRanges(mock, skipping);
  helper.withS3(mock, skipping);
  helper.withQueueService(mock, skipping);
  helper.withBlobStore(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withEntities(mock, skipping);
  helper.withServer(mock, skipping);

  // Use the same task definition for everything
  const makeTask = () => {
    const task = {
      provisionerId:    'no-provisioner',
      workerType:       'test-worker',
      // Legal because we allow a small bit of clock drift
      created:          taskcluster.fromNowJSON('- 5 seconds'),
      deadline:         taskcluster.fromNowJSON('15 seconds'),
      retries:          1,
      payload:          {},
      metadata: {
        name:           'Unit testing task',
        description:    'Task created during unit tests',
        owner:          'jonsafj@mozilla.com',
        source:         'https://github.com/taskcluster/taskcluster-queue',
      },
    };
    return {taskId: slugid.v4(), task};
  };

  test('Resolve unscheduled task deadline', helper.runWithFakeTime(async () => {
    const {taskId, task} = makeTask();

    debug('### Define task');
    const r1 = await helper.queue.defineTask(taskId, task);
    assume(r1.status.state).equals('unscheduled');
    assume(r1.status.runs.length).equals(0);
    helper.checkNextMessage('task-defined');

    debug('### Start deadlineReaper');
    const deadlineReaper = await helper.startPollingService('deadline-resolver');

    debug('### Check for task-exception message');
    await testing.poll(async () => {
      helper.checkNextMessage('task-exception', message => {
        assume(message.payload.status.state).equals('exception');
        assume(message.payload.status.runs.length).equals(1);
        assume(message.payload.status.runs[0].reasonCreated).equals('exception');
        assume(message.payload.status.runs[0].reasonResolved).equals('deadline-exceeded');
      });
    }, Infinity);

    debug('### Stop deadlineReaper');
    await deadlineReaper.terminate();

    debug('### Validate task status');
    const r2 = await helper.queue.status(taskId);
    assume(r2.status.state).equals('exception');
  }, mock));

  test('Resolve pending task deadline', helper.runWithFakeTime(async () => {
    const {taskId, task} = makeTask();

    debug('### Creating task');
    const r1 = await helper.queue.createTask(taskId, task);
    assume(r1.status.state).equals('pending');
    assume(r1.status.runs.length).equals(1);
    helper.checkNextMessage('task-defined');
    helper.checkNextMessage('task-pending');

    debug('### Start deadlineReaper');
    const deadlineReaper = await helper.startPollingService('deadline-resolver');
    await testing.poll(async () => assert(helper.messages.length >= 1), Infinity);

    debug('### Check for task-exception message');
    helper.checkNextMessage('task-group-resolved');
    helper.checkNextMessage('task-exception', message => {
      assume(message.payload.status.state).equals('exception');
      assume(message.payload.status.runs.length).equals(1);
      assume(message.payload.status.runs[0].reasonCreated).equals('scheduled');
      assume(message.payload.status.runs[0].reasonResolved).equals('deadline-exceeded');
    });

    debug('### Stop deadlineReaper');
    await deadlineReaper.terminate();

    debug('### Validate task status');
    const r2 = await helper.queue.status(taskId);
    assume(r2.status.state).deep.equals('exception');
  }, mock));

  test('Resolve running task deadline', helper.runWithFakeTime(async () => {
    const {taskId, task} = makeTask();

    debug('### Creating task');
    const r1 = await helper.queue.createTask(taskId, task);
    assume(r1.status.state).equals('pending');
    assume(r1.status.runs.length).equals(1);
    helper.checkNextMessage('task-defined');
    helper.checkNextMessage('task-pending');

    debug('### Claim task');
    const r2 = await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });
    helper.checkNextMessage('task-running');

    debug('### Start deadlineReaper');
    const deadlineReaper = await helper.startPollingService('deadline-resolver');
    await testing.poll(async () => assert(helper.messages.length >= 1), Infinity);

    debug('### Check for task-exception message');
    helper.checkNextMessage('task-group-resolved');
    helper.checkNextMessage('task-exception', message => {
      assume(message.payload.status.state).equals('exception');
      assume(message.payload.status.runs.length).equals(1);
      assume(message.payload.status.runs[0].reasonCreated).equals('scheduled');
      assume(message.payload.status.runs[0].reasonResolved).equals('deadline-exceeded');
    });

    debug('### Stop deadlineReaper');
    await deadlineReaper.terminate();

    debug('### Validate task status');
    const r3 = await helper.queue.status(taskId);
    assume(r3.status.state).deep.equals('exception');
  }, mock));

  test('Resolve completed task by deadline (no change)', helper.runWithFakeTime(async () => {
    const {taskId, task} = makeTask();

    debug('### Creating task');
    const r1 = await helper.queue.createTask(taskId, task);
    assume(r1.status.state).equals('pending');
    assume(r1.status.runs.length).equals(1);
    helper.checkNextMessage('task-defined');
    helper.checkNextMessage('task-pending');

    debug('### Claim task');
    const r2 = await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });
    helper.checkNextMessage('task-running');

    debug('### Report task completed');
    const r3 = await helper.queue.reportCompleted(taskId, 0);
    helper.checkNextMessage('task-completed');

    debug('### Start deadlineReaper');
    const deadlineReaper = await helper.startPollingService('deadline-resolver');

    debug('### Ensure that we got no task-exception message');
    await testing.sleep(1000); // give it time to poll
    assume(helper.messages.length).to.equal(0);

    debug('### Stop deadlineReaper');
    deadlineReaper.terminate();

    debug('### Validate task status');
    const r4 = await helper.queue.status(taskId);
    assume(r4.status).deep.equals(r3.status);
  }, mock));
});
