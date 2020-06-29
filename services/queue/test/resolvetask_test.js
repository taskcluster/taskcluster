const _ = require('lodash');
const debug = require('debug')('test:completed');
const assert = require('assert');
const slugid = require('slugid');
const taskcluster = require('taskcluster-client');
const assume = require('assume');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');
const {LEVELS} = require('taskcluster-lib-monitor');

helper.secrets.mockSuite(testing.suiteName(), ['aws', 'db'], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withAmazonIPRanges(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withS3(mock, skipping);
  helper.withQueueService(mock, skipping);
  helper.withEntities(mock, skipping);
  helper.withServer(mock, skipping);
  helper.resetTables(mock, skipping);

  // Use the same task definition for everything
  const taskDef = {
    provisionerId: 'no-provisioner-extended-extended',
    workerType: 'test-worker-extended-extended',
    schedulerId: 'my-scheduler-extended-extended',
    taskGroupId: 'dSlITZ4yQgmvxxAi4A8fHQ',
    routes: [],
    retries: 1,
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

  let monitor;
  suiteSetup(async function() {
    monitor = await helper.load('monitor');
  });

  test('reportCompleted is idempotent', async () => {
    const taskId = slugid.v4();

    debug('### Creating task');
    await helper.queue.createTask(taskId, taskDef);

    debug('### Claiming task');
    // First runId is always 0, so we should be able to claim it here
    let r1 = await helper.queue.claimTask(taskId, 0, {
      workerGroup: 'my-worker-group-extended-extended',
      workerId: 'my-worker-extended-extended',
    });
    helper.assertNoPulseMessage('task-completed');

    debug('### Reporting task completed');
    helper.scopes(
      'queue:resolve-task',
      'assume:worker-id:my-worker-group-extended-extended/my-worker-extended-extended',
    );
    await helper.queue.reportCompleted(taskId, 0);
    helper.assertPulseMessage('task-completed', m => (
      m.payload.status.runs[0].state === 'completed' &&
      _.isEqual(m.payload.task.tags, taskDef.tags)));
    helper.clearPulseMessages();

    assert.deepEqual(monitor.manager.messages.find(({Type}) => Type === 'task-completed'), {
      Logger: 'taskcluster.test.api',
      Type: 'task-completed',
      Fields: {taskId, runId: 0, v: 1},
      Severity: LEVELS.notice,
    });

    debug('### Reporting task completed (again)');
    await helper.queue.reportCompleted(taskId, 0);
    // idempotent, but sends the message again..
    helper.assertPulseMessage('task-completed', m => (
      m.payload.status.runs[0].state === 'completed' &&
      _.isEqual(m.payload.task.tags, taskDef.tags)));
    helper.clearPulseMessages();

    debug('### Reporting task completed (using temp creds)');
    let queue = new helper.Queue({rootUrl: helper.rootUrl, credentials: r1.credentials});
    await queue.reportCompleted(taskId, 0);
    helper.assertPulseMessage('task-completed', m => m.payload.status.runs[0].state === 'completed');
    helper.clearPulseMessages();
  });

  test('reportFailed is idempotent', async () => {
    const taskId = slugid.v4();

    debug('### Creating task');
    await helper.queue.createTask(taskId, taskDef);

    debug('### Claiming task');
    // First runId is always 0, so we should be able to claim it here
    let r1 = await helper.queue.claimTask(taskId, 0, {
      workerGroup: 'my-worker-group-extended-extended',
      workerId: 'my-worker-extended-extended',
    });
    helper.assertNoPulseMessage('task-completed');

    debug('### Reporting task failed');
    helper.scopes(
      'queue:resolve-task',
      'assume:worker-id:my-worker-group-extended-extended/my-worker-extended-extended',
    );
    await helper.queue.reportFailed(taskId, 0);
    helper.assertPulseMessage('task-failed', m => (
      m.payload.status.runs[0].state === 'failed' &&
      _.isEqual(m.payload.task.tags, taskDef.tags)));
    helper.clearPulseMessages();

    assert.deepEqual(monitor.manager.messages.find(({Type}) => Type === 'task-failed'), {
      Logger: 'taskcluster.test.api',
      Type: 'task-failed',
      Fields: {taskId, runId: 0, v: 1},
      Severity: LEVELS.notice,
    });

    debug('### Reporting task failed (again)');
    await helper.queue.reportFailed(taskId, 0);
    helper.assertPulseMessage('task-failed', m => (
      m.payload.status.runs[0].state === 'failed' &&
      _.isEqual(m.payload.task.tags, taskDef.tags)));
    helper.clearPulseMessages();

    debug('### Reporting task failed (using temp creds)');
    let queue = new helper.Queue({rootUrl: helper.rootUrl, credentials: r1.credentials});
    await queue.reportFailed(taskId, 0);
    helper.assertPulseMessage('task-failed', m => m.payload.status.runs[0].state === 'failed');
    helper.clearPulseMessages();
  });

  test('reportException (malformed-payload) is idempotent', async () => {
    const taskId = slugid.v4();

    debug('### Creating task');
    await helper.queue.createTask(taskId, taskDef);

    debug('### Claiming task');
    // First runId is always 0, so we should be able to claim it here
    let r1 = await helper.queue.claimTask(taskId, 0, {
      workerGroup: 'my-worker-group-extended-extended',
      workerId: 'my-worker-extended-extended',
    });

    debug('### Reporting task exception');
    helper.scopes(
      'queue:resolve-task',
      'assume:worker-id:my-worker-group-extended-extended/my-worker-extended-extended',
    );
    await helper.queue.reportException(taskId, 0, {
      reason: 'malformed-payload',
    });
    helper.assertPulseMessage('task-exception', m => (
      m.payload.status.runs[0].state === 'exception' &&
      m.payload.status.runs[0].reasonResolved === 'malformed-payload' &&
      _.isEqual(m.payload.task.tags, taskDef.tags)));
    helper.clearPulseMessages();

    assert.deepEqual(monitor.manager.messages.find(({Type}) => Type === 'task-exception'), {
      Logger: 'taskcluster.test.api',
      Type: 'task-exception',
      Fields: {taskId, runId: 0, v: 1},
      Severity: LEVELS.notice,
    });

    debug('### Reporting task exception (again)');
    await helper.queue.reportException(taskId, 0, {
      reason: 'malformed-payload',
    });
    helper.assertPulseMessage('task-exception', m => (
      m.payload.status.runs[0].state === 'exception' &&
      m.payload.status.runs[0].reasonResolved === 'malformed-payload' &&
      _.isEqual(m.payload.task.tags, taskDef.tags)));
    helper.clearPulseMessages();

    debug('### Check status of task');
    const {status: s2} = await helper.queue.status(taskId);
    assume(s2.runs[0].state).equals('exception');
    assume(s2.runs[0].reasonResolved).equals('malformed-payload');

    debug('### Reporting task exception (using temp creds)');
    let queue = new helper.Queue({rootUrl: helper.rootUrl, credentials: r1.credentials});
    await queue.reportException(taskId, 0, {
      reason: 'malformed-payload',
    });
    helper.assertPulseMessage('task-exception', m => (
      m.payload.status.runs[0].state === 'exception' &&
      m.payload.status.runs[0].reasonResolved === 'malformed-payload'));
  });

  test('reportException (resource-unavailable) is idempotent', async () => {
    const taskId = slugid.v4();

    debug('### Creating task');
    await helper.queue.createTask(taskId, taskDef);

    debug('### Claiming task');
    // First runId is always 0, so we should be able to claim it here
    let r1 = await helper.queue.claimTask(taskId, 0, {
      workerGroup: 'my-worker-group-extended-extended',
      workerId: 'my-worker-extended-extended',
    });

    debug('### Reporting task exception');
    helper.scopes(
      'queue:resolve-task',
      'assume:worker-id:my-worker-group-extended-extended/my-worker-extended-extended',
    );
    await helper.queue.reportException(taskId, 0, {
      reason: 'resource-unavailable',
    });
    helper.assertPulseMessage('task-exception', m => (
      m.payload.status.runs[0].state === 'exception' &&
      m.payload.status.runs[0].reasonResolved === 'resource-unavailable'));
    helper.clearPulseMessages();

    debug('### Reporting task exception (again)');
    await helper.queue.reportException(taskId, 0, {
      reason: 'resource-unavailable',
    });
    helper.assertPulseMessage('task-exception', m => (
      m.payload.status.runs[0].state === 'exception' &&
      m.payload.status.runs[0].reasonResolved === 'resource-unavailable'));
    helper.clearPulseMessages();

    debug('### Check status of task');
    const {status: s2} = await helper.queue.status(taskId);
    assume(s2.runs[0].state).equals('exception');
    assume(s2.runs[0].reasonResolved).equals('resource-unavailable');

    debug('### Reporting task exception (using temp creds)');
    let queue = new helper.Queue({rootUrl: helper.rootUrl, credentials: r1.credentials});
    await queue.reportException(taskId, 0, {
      reason: 'resource-unavailable',
    });
    helper.assertPulseMessage('task-exception', m => (
      m.payload.status.runs[0].state === 'exception' &&
      m.payload.status.runs[0].reasonResolved === 'resource-unavailable'));
    helper.clearPulseMessages();
  });

  test('reportException (internal-error) is idempotent', async () => {
    const taskId = slugid.v4();

    debug('### Creating task');
    await helper.queue.createTask(taskId, taskDef);

    debug('### Claiming task');
    // First runId is always 0, so we should be able to claim it here
    let r1 = await helper.queue.claimTask(taskId, 0, {
      workerGroup: 'my-worker-group-extended-extended',
      workerId: 'my-worker-extended-extended',
    });

    debug('### Reporting task exception');
    helper.scopes(
      'queue:resolve-task',
      'assume:worker-id:my-worker-group-extended-extended/my-worker-extended-extended',
    );
    await helper.queue.reportException(taskId, 0, {
      reason: 'internal-error',
    });
    helper.assertPulseMessage('task-exception', m => (
      m.payload.status.runs[0].state === 'exception' &&
      m.payload.status.runs[0].reasonResolved === 'internal-error'));
    helper.clearPulseMessages();

    debug('### Reporting task exception (again)');
    await helper.queue.reportException(taskId, 0, {
      reason: 'internal-error',
    });
    helper.assertPulseMessage('task-exception', m => (
      m.payload.status.runs[0].state === 'exception' &&
      m.payload.status.runs[0].reasonResolved === 'internal-error'));
    helper.clearPulseMessages();

    debug('### Check status of task');
    const {status: s2} = await helper.queue.status(taskId);
    assume(s2.runs[0].state).equals('exception');
    assume(s2.runs[0].reasonResolved).equals('internal-error');

    debug('### Reporting task exception (using temp creds)');
    let queue = new helper.Queue({rootUrl: helper.rootUrl, credentials: r1.credentials});
    await queue.reportException(taskId, 0, {
      reason: 'internal-error',
    });
    helper.assertPulseMessage('task-exception', m => (
      m.payload.status.runs[0].state === 'exception' &&
      m.payload.status.runs[0].reasonResolved === 'internal-error'));
    helper.clearPulseMessages();
  });

  test('reportException (superseded) is idempotent', async () => {
    const taskId = slugid.v4();

    debug('### Creating task');
    await helper.queue.createTask(taskId, taskDef);

    debug('### Claiming task');
    // First runId is always 0, so we should be able to claim it here
    let r1 = await helper.queue.claimTask(taskId, 0, {
      workerGroup: 'my-worker-group-extended-extended',
      workerId: 'my-worker-extended-extended',
    });

    debug('### Reporting task exception');
    helper.scopes(
      'queue:resolve-task',
      'assume:worker-id:my-worker-group-extended-extended/my-worker-extended-extended',
    );
    await helper.queue.reportException(taskId, 0, {
      reason: 'superseded',
    });
    helper.assertPulseMessage('task-exception', m => (
      m.payload.status.runs[0].state === 'exception' &&
      m.payload.status.runs[0].reasonResolved === 'superseded'));
    helper.clearPulseMessages();

    debug('### Reporting task exception (again)');
    await helper.queue.reportException(taskId, 0, {
      reason: 'superseded',
    });
    helper.assertPulseMessage('task-exception', m => (
      m.payload.status.runs[0].state === 'exception' &&
      m.payload.status.runs[0].reasonResolved === 'superseded'));
    helper.clearPulseMessages();

    debug('### Check status of task');
    const {status: s2} = await helper.queue.status(taskId);
    assume(s2.runs[0].state).equals('exception');
    assume(s2.runs[0].reasonResolved).equals('superseded');

    debug('### Reporting task exception (using temp creds)');
    let queue = new helper.Queue({rootUrl: helper.rootUrl, credentials: r1.credentials});
    await queue.reportException(taskId, 0, {
      reason: 'superseded',
    });
    helper.assertPulseMessage('task-exception', m => (
      m.payload.status.runs[0].state === 'exception' &&
      m.payload.status.runs[0].reasonResolved === 'superseded'));
    helper.clearPulseMessages();
  });

  test('reportException can\'t overwrite reason', async () => {
    const taskId = slugid.v4();

    debug('### Creating task');
    await helper.queue.createTask(taskId, taskDef);

    debug('### Claiming task');
    // First runId is always 0, so we should be able to claim it here
    await helper.queue.claimTask(taskId, 0, {
      workerGroup: 'my-worker-group-extended-extended',
      workerId: 'my-worker-extended-extended',
    });

    debug('### Reporting task exception (malformed-payload)');
    await helper.queue.reportException(taskId, 0, {
      reason: 'malformed-payload',
    });

    debug('### Check status of task');
    const {status: s1} = await helper.queue.status(taskId);
    assume(s1.runs[0].state).equals('exception');
    assume(s1.runs[0].reasonResolved).equals('malformed-payload');

    debug('### Reporting task exception (internal-error)');
    await helper.queue.reportException(taskId, 0, {
      reason: 'internal-error',
    }).then(() => {
      assert(false, 'Expected error');
    }, err => {
      if (err.statusCode !== 409) {
        throw err;
      }
    });

    debug('### Check status of task (again)');
    const {status: s2} = await helper.queue.status(taskId);
    assume(s2.runs[0].state).equals('exception');
    assume(s2.runs[0].reasonResolved).equals('malformed-payload');
  });

  test('reportException (worker-shutdown) is idempotent', async () => {
    const taskId = slugid.v4();

    debug('### Creating task');
    await helper.queue.createTask(taskId, taskDef);
    helper.assertPulseMessage('task-defined');
    helper.assertPulseMessage('task-pending');

    debug('### Claiming task');
    // First runId is always 0, so we should be able to claim it here
    await helper.queue.claimTask(taskId, 0, {
      workerGroup: 'my-worker-group-extended-extended',
      workerId: 'my-worker-extended-extended',
    });
    helper.assertPulseMessage('task-running');
    helper.clearPulseMessages();

    debug('### Reporting task exception (worker-shutdown)');
    helper.scopes(
      'queue:resolve-task',
      'assume:worker-id:my-worker-group-extended-extended/my-worker-extended-extended',
    );
    const r1 = await helper.queue.reportException(taskId, 0, {
      reason: 'worker-shutdown',
    });
    assume(r1.status.runs.length).equals(2);
    assume(r1.status.runs[0].state).equals('exception');
    assume(r1.status.runs[0].reasonResolved).equals('worker-shutdown');
    assume(r1.status.runs[1].state).equals('pending');
    assume(r1.status.runs[1].reasonCreated).equals('retry');

    // no exception message, just right back to pending
    helper.assertNoPulseMessage('task-exception');
    helper.assertPulseMessage('task-pending', m => (
      _.isEqual(m.payload.status, r1.status) &&
      m.payload.runId === 1));
    helper.clearPulseMessages();

    await helper.queue.reportException(taskId, 0, {
      reason: 'worker-shutdown',
    });
    helper.assertNoPulseMessage('task-exception');
    helper.assertPulseMessage('task-pending');
    helper.clearPulseMessages();

    helper.scopes();
    await helper.queue.claimTask(taskId, 1, {
      workerGroup: 'my-worker-group-extended-extended',
      workerId: 'my-worker-extended-extended',
    });
    helper.assertPulseMessage('task-running');

    debug('### Reporting task exception (again)');
    await helper.queue.reportException(taskId, 1, {
      reason: 'worker-shutdown',
    });
    helper.assertPulseMessage('task-exception', m => (
      m.payload.status.runs[0].state === 'exception' &&
      m.payload.status.runs[0].reasonResolved === 'worker-shutdown' &&
      m.payload.status.runs[1].state === 'exception' &&
      m.payload.status.runs[1].reasonResolved === 'worker-shutdown'));
  });

  test('reportCompleted with bad scopes', async () => {
    const taskId = slugid.v4();

    debug('### Creating task');
    await helper.queue.createTask(taskId, taskDef);

    debug('### Claiming task');
    // First runId is always 0, so we should be able to claim it here
    await helper.queue.claimTask(taskId, 0, {
      workerGroup: 'my-worker-group-extended-extended',
      workerId: 'my-worker-extended-extended',
    });

    debug('### Reporting task completed');
    helper.scopes(
      'assume:worker-id:my-worker-group-extended-extended/my-worker-extended-extended',
    );
    await helper.queue.reportCompleted(taskId, 0).then(function() {
      throw new Error('Expected authentication error');
    }, function(err) {
      if (err.code !== 'InsufficientScopes') {
        throw err;
      }
    });
  });

  test('reportCompleted with a pending task', async () => {
    const taskId = slugid.v4();

    debug('### Creating task');
    await helper.queue.createTask(taskId, taskDef);

    debug('### Reporting task completed');
    await assert.rejects(
      () => helper.queue.reportCompleted(taskId, 0),
      err => err.statusCode === 409);
  });

  test('reportException (intermittent-task) is idempotent', async () => {
    const taskId = slugid.v4();

    debug('### Creating task');
    await helper.queue.createTask(taskId, taskDef);
    helper.assertPulseMessage('task-defined');
    helper.assertPulseMessage('task-pending');

    debug('### Claiming task');
    // First runId is always 0, so we should be able to claim it here
    await helper.queue.claimTask(taskId, 0, {
      workerGroup: 'my-worker-group-extended-extended',
      workerId: 'my-worker-extended-extended',
    });
    helper.assertPulseMessage('task-running');
    helper.clearPulseMessages();

    debug('### Reporting task exception (intermittent-task)');
    helper.scopes(
      'queue:resolve-task',
      'assume:worker-id:my-worker-group-extended-extended/my-worker-extended-extended',
    );
    const r1 = await helper.queue.reportException(taskId, 0, {
      reason: 'intermittent-task',
    });
    assume(r1.status.runs.length).equals(2);
    assume(r1.status.runs[0].state).equals('exception');
    assume(r1.status.runs[1].state).equals('pending');
    await helper.queue.reportException(taskId, 0, {
      reason: 'intermittent-task',
    });
    helper.assertPulseMessage('task-pending', m => (
      _.isEqual(m.payload.status, r1.status) &&
      m.payload.runId === 1 &&
      m.payload.status.runs[0].reasonResolved === 'intermittent-task' &&
      m.payload.status.runs[1].reasonCreated === 'task-retry'));
    helper.clearPulseMessages();

    helper.scopes();
    await helper.queue.claimTask(taskId, 1, {
      workerGroup: 'my-worker-group-extended-extended',
      workerId: 'my-worker-extended-extended',
    });
    helper.assertPulseMessage('task-running');

    debug('### Reporting task exception (again)');
    await helper.queue.reportException(taskId, 1, {
      reason: 'intermittent-task',
    });

    helper.assertPulseMessage('task-exception', m => (
      m.payload.status.runs[1].state === 'exception' &&
      m.payload.status.runs.length === 2));
  });
});
