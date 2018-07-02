const debug       = require('debug')('test:claim');
const assert      = require('assert');
const slugid      = require('slugid');
const _           = require('lodash');
const taskcluster = require('taskcluster-client');
const assume      = require('assume');
const helper      = require('./helper');
const testing     = require('taskcluster-lib-testing');

helper.secrets.mockSuite(__filename, ['taskcluster', 'aws', 'azure'], function(mock, skipping) {
  helper.withAmazonIPRanges(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withS3(mock, skipping);
  helper.withQueueService(mock, skipping);
  helper.withBlobStore(mock, skipping);
  helper.withEntities(mock, skipping);
  helper.withServer(mock, skipping);

  // Use the same task definition for everything
  const taskDef = () => ({
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
  });

  test('can claimTask', helper.runWithFakeTime(async function() {
    const taskId = slugid.v4();

    debug('### Creating task');
    await helper.queue.createTask(taskId, taskDef());
    helper.checkNextMessage('task-defined');
    helper.checkNextMessage('task-pending');

    debug('### Claim task');
    // Reduce scopes available to test minimum set of scopes required
    helper.scopes(
      'queue:claim-task',
      'assume:worker-type:no-provisioner/test-worker',
      'assume:worker-id:my-worker-group/my-worker',
    );
    // First runId is always 0, so we should be able to claim it here
    const before = new Date();
    const r1 = await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });
    helper.checkNextMessage('task-running');

    const takenUntil = new Date(r1.takenUntil);
    // Compare to time before the request, because claimTimeout is very small
    // so we can only count on takenUntil being larger than or equal to the
    // time before the request was made
    assume(takenUntil.getTime()).is.greaterThan(before.getTime() - 1);

    // Check that task definition is included..
    assume(r1.task).deep.equals(await helper.queue.task(taskId));

    debug('### Fetch task status');
    const r2 = await helper.queue.status(taskId);
    assume(r2.status).deep.equals(r1.status);

    debug('### reclaimTask');
    await testing.sleep(100);
    // Again we talking about the first run, so runId must still be 0
    const r3 = await helper.queue.reclaimTask(taskId, 0);
    const takenUntil2 = new Date(r3.takenUntil);
    assume(takenUntil2.getTime()).is.greaterThan(takenUntil.getTime() - 1);

    debug('### reclaimTask using temp creds from claim');
    await testing.sleep(100);
    // Works because r1.credentials expires at takenUntil, and are not revoked
    // on reclaimTask
    const queue = new helper.Queue({rootUrl: helper.rootUrl, credentials: r1.credentials});
    const r4 = await queue.reclaimTask(taskId, 0);
    const takenUntil3 = new Date(r4.takenUntil);
    assume(takenUntil3.getTime()).is.greaterThan(takenUntil.getTime() - 1);
    assume(takenUntil3.getTime()).is.greaterThan(takenUntil2.getTime() - 1);

    debug('### reclaimTask using temp creds from reclaim');
    await testing.sleep(100);
    const queue2 = new helper.Queue({rootUrl: helper.rootUrl, credentials: r4.credentials});
    const r5 = await queue2.reclaimTask(taskId, 0);
    const takenUntil4 = new Date(r5.takenUntil);
    assume(takenUntil4.getTime()).is.greaterThan(takenUntil.getTime() - 1);
    assume(takenUntil4.getTime()).is.greaterThan(takenUntil2.getTime() - 1);
    assume(takenUntil4.getTime()).is.greaterThan(takenUntil3.getTime() - 1);
  }, mock));

  test('claimTask is idempotent', async () => {
    const taskId = slugid.v4();
    await helper.queue.createTask(taskId, taskDef());
    // First runId is always 0, so we should be able to claim it here
    await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });

    await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });

    await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker2',
    }).then(() => {
      throw new Error('This request should have failed');
    }, (err) => {
      if (err.code != 'RequestConflict') {
        throw err;
      }
    });
  });

  test('claimTask requires scopes', async () => {
    const taskId = slugid.v4();

    await helper.queue.createTask(taskId, taskDef());

    // leave out a required scope
    helper.scopes(
      'assume:worker-type:no-provisioner/test-worker',
      'assume:worker-id:my-worker-group/my-worker',
    );
    // First runId is always 0, so we should be able to claim it here
    await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    }).then(() => {
      throw new Error('Expected an authentication error');
    }, (err) => {
      if (err.code != 'InsufficientScopes') {
        throw err;
      }
    });

    // leave out a required scope
    helper.scopes(
      'queue:claim-task',
      'assume:worker-id:my-worker-group/my-worker',
    );
    // First runId is always 0, so we should be able to claim it here
    await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    }).then(() => {
      throw new Error('Expected an authentication error');
    }, (err)  => {
      if (err.code != 'InsufficientScopes') {
        throw err;
      }
    });

    // leave out a required scope
    helper.scopes(
      'queue:claim-task',
      'assume:worker-type:no-provisioner/test-worker',
    );
    // First runId is always 0, so we should be able to claim it here
    await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    }).then(() => {
      throw new Error('Expected an authentication error');
    }, (err) => {
      if (err.code != 'InsufficientScopes') {
        throw err;
      }
    });
  });
});
