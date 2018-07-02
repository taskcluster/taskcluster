const debug = require('debug')('test:completed');
const assert = require('assert');
const slugid = require('slugid');
const _ = require('lodash');
const taskcluster = require('taskcluster-client');
const assume = require('assume');
const helper = require('./helper');

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
    retries:          1,
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

  test('reportCompleted is idempotent', async () => {
    const taskId = slugid.v4();

    debug('### Creating task');
    await helper.queue.createTask(taskId, taskDef);

    debug('### Claiming task');
    // First runId is always 0, so we should be able to claim it here
    let r1 = await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });
    helper.checkNoNextMessage('task-completed');

    debug('### Reporting task completed');
    helper.scopes(
      'queue:resolve-task',
      'assume:worker-id:my-worker-group/my-worker',
    );
    await helper.queue.reportCompleted(taskId, 0);
    helper.checkNextMessage('task-completed', m =>
      assume(m.payload.status.runs[0].state).equals('completed'));

    debug('### Reporting task completed (again)');
    await helper.queue.reportCompleted(taskId, 0);
    // idempotent, but sends the message again..
    helper.checkNextMessage('task-completed', m =>
      assume(m.payload.status.runs[0].state).equals('completed'));

    debug('### Reporting task completed (using temp creds)');
    let queue = new helper.Queue({rootUrl: helper.rootUrl, credentials: r1.credentials});
    await queue.reportCompleted(taskId, 0);
    helper.checkNextMessage('task-completed', m =>
      assume(m.payload.status.runs[0].state).equals('completed'));
  });

  test('reportFailed is idempotent', async () => {
    const taskId = slugid.v4();

    debug('### Creating task');
    await helper.queue.createTask(taskId, taskDef);

    debug('### Claiming task');
    // First runId is always 0, so we should be able to claim it here
    let r1 = await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });
    helper.checkNoNextMessage('task-completed');

    debug('### Reporting task failed');
    helper.scopes(
      'queue:resolve-task',
      'assume:worker-id:my-worker-group/my-worker',
    );
    await helper.queue.reportFailed(taskId, 0);
    helper.checkNextMessage('task-failed', m =>
      assume(m.payload.status.runs[0].state).equals('failed'));

    debug('### Reporting task failed (again)');
    await helper.queue.reportFailed(taskId, 0);
    helper.checkNextMessage('task-failed', m =>
      assume(m.payload.status.runs[0].state).equals('failed'));

    debug('### Reporting task failed (using temp creds)');
    let queue = new helper.Queue({rootUrl: helper.rootUrl, credentials: r1.credentials});
    await queue.reportFailed(taskId, 0);
    helper.checkNextMessage('task-failed', m =>
      assume(m.payload.status.runs[0].state).equals('failed'));
  });

  test('reportException (malformed-payload) is idempotent', async () => {
    const taskId = slugid.v4();

    debug('### Creating task');
    await helper.queue.createTask(taskId, taskDef);

    debug('### Claiming task');
    // First runId is always 0, so we should be able to claim it here
    let r1 = await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });

    debug('### Reporting task exception');
    helper.scopes(
      'queue:resolve-task',
      'assume:worker-id:my-worker-group/my-worker',
    );
    await helper.queue.reportException(taskId, 0, {
      reason:     'malformed-payload',
    });
    helper.checkNextMessage('task-exception', m => {
      assume(m.payload.status.runs[0].state).equals('exception');
      assume(m.payload.status.runs[0].reasonResolved).equals('malformed-payload');
    });

    debug('### Reporting task exception (again)');
    await helper.queue.reportException(taskId, 0, {
      reason:     'malformed-payload',
    });
    helper.checkNextMessage('task-exception');

    debug('### Check status of task');
    const {status: s2} = await helper.queue.status(taskId);
    assume(s2.runs[0].state).equals('exception');
    assume(s2.runs[0].reasonResolved).equals('malformed-payload');

    debug('### Reporting task exception (using temp creds)');
    let queue = new helper.Queue({rootUrl: helper.rootUrl, credentials: r1.credentials});
    await queue.reportException(taskId, 0, {
      reason:     'malformed-payload',
    });
    helper.checkNextMessage('task-exception');
  });

  test('reportException (resource-unavailable) is idempotent', async () => {
    const taskId = slugid.v4();

    debug('### Creating task');
    await helper.queue.createTask(taskId, taskDef);

    debug('### Claiming task');
    // First runId is always 0, so we should be able to claim it here
    let r1 = await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });

    debug('### Reporting task exception');
    helper.scopes(
      'queue:resolve-task',
      'assume:worker-id:my-worker-group/my-worker',
    );
    await helper.queue.reportException(taskId, 0, {
      reason:     'resource-unavailable',
    });
    helper.checkNextMessage('task-exception', m => {
      assume(m.payload.status.runs[0].state).equals('exception');
      assume(m.payload.status.runs[0].reasonResolved).equals('resource-unavailable');
    });

    debug('### Reporting task exception (again)');
    await helper.queue.reportException(taskId, 0, {
      reason:     'resource-unavailable',
    });
    helper.checkNextMessage('task-exception');

    debug('### Check status of task');
    const {status: s2} = await helper.queue.status(taskId);
    assume(s2.runs[0].state).equals('exception');
    assume(s2.runs[0].reasonResolved).equals('resource-unavailable');

    debug('### Reporting task exception (using temp creds)');
    let queue = new helper.Queue({rootUrl: helper.rootUrl, credentials: r1.credentials});
    await queue.reportException(taskId, 0, {
      reason:     'resource-unavailable',
    });
    helper.checkNextMessage('task-exception');
  });

  test('reportException (internal-error) is idempotent', async () => {
    const taskId = slugid.v4();

    debug('### Creating task');
    await helper.queue.createTask(taskId, taskDef);

    debug('### Claiming task');
    // First runId is always 0, so we should be able to claim it here
    let r1 = await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });

    debug('### Reporting task exception');
    helper.scopes(
      'queue:resolve-task',
      'assume:worker-id:my-worker-group/my-worker'
    );
    await helper.queue.reportException(taskId, 0, {
      reason:     'internal-error',
    });
    helper.checkNextMessage('task-exception', m => {
      assume(m.payload.status.runs[0].state).equals('exception');
      assume(m.payload.status.runs[0].reasonResolved).equals('internal-error');
    });

    debug('### Reporting task exception (again)');
    await helper.queue.reportException(taskId, 0, {
      reason:     'internal-error',
    });
    helper.checkNextMessage('task-exception');

    debug('### Check status of task');
    const {status: s2} = await helper.queue.status(taskId);
    assume(s2.runs[0].state).equals('exception');
    assume(s2.runs[0].reasonResolved).equals('internal-error');

    debug('### Reporting task exception (using temp creds)');
    let queue = new helper.Queue({rootUrl: helper.rootUrl, credentials: r1.credentials});
    await queue.reportException(taskId, 0, {
      reason:     'internal-error',
    });
    helper.checkNextMessage('task-exception');
  });

  test('reportException (superseded) is idempotent', async () => {
    const taskId = slugid.v4();

    debug('### Creating task');
    await helper.queue.createTask(taskId, taskDef);

    debug('### Claiming task');
    // First runId is always 0, so we should be able to claim it here
    let r1 = await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });

    debug('### Reporting task exception');
    helper.scopes(
      'queue:resolve-task',
      'assume:worker-id:my-worker-group/my-worker',
    );
    await helper.queue.reportException(taskId, 0, {
      reason:     'superseded',
    });
    helper.checkNextMessage('task-exception', m => {
      assume(m.payload.status.runs[0].state).equals('exception');
      assume(m.payload.status.runs[0].reasonResolved).equals('superseded');
    });

    debug('### Reporting task exception (again)');
    await helper.queue.reportException(taskId, 0, {
      reason:     'superseded',
    });
    helper.checkNextMessage('task-exception');

    debug('### Check status of task');
    const {status: s2} = await helper.queue.status(taskId);
    assume(s2.runs[0].state).equals('exception');
    assume(s2.runs[0].reasonResolved).equals('superseded');

    debug('### Reporting task exception (using temp creds)');
    let queue = new helper.Queue({rootUrl: helper.rootUrl, credentials: r1.credentials});
    await queue.reportException(taskId, 0, {
      reason:     'superseded',
    });
    helper.checkNextMessage('task-exception');
  });

  test('reportException can\'t overwrite reason', async () => {
    const taskId = slugid.v4();

    debug('### Creating task');
    await helper.queue.createTask(taskId, taskDef);

    debug('### Claiming task');
    // First runId is always 0, so we should be able to claim it here
    await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });

    debug('### Reporting task exception (malformed-payload)');
    await helper.queue.reportException(taskId, 0, {
      reason:     'malformed-payload',
    });

    debug('### Check status of task');
    const {status: s1} = await helper.queue.status(taskId);
    assume(s1.runs[0].state).equals('exception');
    assume(s1.runs[0].reasonResolved).equals('malformed-payload');

    debug('### Reporting task exception (internal-error)');
    await helper.queue.reportException(taskId, 0, {
      reason:     'internal-error',
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
    helper.checkNextMessage('task-defined');
    helper.checkNextMessage('task-pending');

    debug('### Claiming task');
    // First runId is always 0, so we should be able to claim it here
    await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });
    helper.checkNextMessage('task-running');

    debug('### Reporting task exception (worker-shutdown)');
    helper.scopes(
      'queue:resolve-task',
      'assume:worker-id:my-worker-group/my-worker',
    );
    const r1 = await helper.queue.reportException(taskId, 0, {
      reason:     'worker-shutdown',
    });
    assume(r1.status.runs.length).equals(2);
    assume(r1.status.runs[0].state).equals('exception');
    assume(r1.status.runs[0].reasonResolved).equals('worker-shutdown');
    assume(r1.status.runs[1].state).equals('pending');
    assume(r1.status.runs[1].reasonCreated).equals('retry');

    // no exception message, just right back to pending
    helper.checkNoNextMessage('task-exception');
    helper.checkNextMessage('task-pending', m => {
      assume(m.payload.status).deep.equals(r1.status);
      assume(m.payload.runId).equals(1);
    });

    await helper.queue.reportException(taskId, 0, {
      reason:     'worker-shutdown',
    });
    helper.checkNoNextMessage('task-exception');
    helper.checkNextMessage('task-pending');

    helper.scopes();
    await helper.queue.claimTask(taskId, 1, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });
    helper.checkNextMessage('task-running');

    debug('### Reporting task exception (again)');
    await helper.queue.reportException(taskId, 1, {
      reason:     'worker-shutdown',
    });
    helper.checkNextMessage('task-exception', m => {
      assume(m.payload.status.runs[1].state).equals('exception');
      assume(m.payload.status.runs.length).equals(2);
    });
  });

  test('reportComplete with bad scopes', async () => {
    const taskId = slugid.v4();

    debug('### Creating task');
    await helper.queue.createTask(taskId, taskDef);

    debug('### Claiming task');
    // First runId is always 0, so we should be able to claim it here
    await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });

    debug('### Reporting task completed');
    helper.scopes(
      'assume:worker-id:my-worker-group/my-worker',
    );
    await helper.queue.reportCompleted(taskId, 0).then(function() {
      throw new Error('Expected authentication error');
    }, function(err) {
      if (err.code != 'InsufficientScopes') {
        throw err;
      }
    });
  });

  test('reportException (intermittent-task) is idempotent', async () => {
    const taskId = slugid.v4();

    debug('### Creating task');
    await helper.queue.createTask(taskId, taskDef);
    helper.checkNextMessage('task-defined');
    helper.checkNextMessage('task-pending');

    debug('### Claiming task');
    // First runId is always 0, so we should be able to claim it here
    await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });
    helper.checkNextMessage('task-running');

    debug('### Reporting task exception (intermittent-task)');
    helper.scopes(
      'queue:resolve-task',
      'assume:worker-id:my-worker-group/my-worker',
    );
    const r1 = await helper.queue.reportException(taskId, 0, {
      reason:     'intermittent-task',
    });
    assume(r1.status.runs.length).equals(2);
    assume(r1.status.runs[0].state).equals('exception');
    assume(r1.status.runs[1].state).equals('pending');
    await helper.queue.reportException(taskId, 0, {
      reason:     'intermittent-task',
    });
    helper.checkNextMessage('task-pending', m => {
      assume(m.payload.status).deep.equals(r1.status);
      assume(m.payload.runId).equals(1);
      assume(m.payload.status.runs[0].reasonResolved).equals('intermittent-task');
      assume(m.payload.status.runs[1].reasonCreated).equals('task-retry');
    });

    helper.scopes();
    await helper.queue.claimTask(taskId, 1, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });
    helper.checkNextMessage('task-running');

    debug('### Reporting task exception (again)');
    await helper.queue.reportException(taskId, 1, {
      reason:     'intermittent-task',
    });

    helper.checkNextMessage('task-exception', m => {
      assume(m.payload.status.runs[1].state).equals('exception');
      assume(m.payload.status.runs.length).equals(2);
    });
  });
});
