import assert from 'assert';
import helper from './helper.js';
import _ from 'lodash';
import testing from '@taskcluster/lib-testing';
import taskcluster from '@taskcluster/client';
import { Worker, WorkerPoolError, WorkerPoolStats } from '../src/data.js';

helper.secrets.mockSuite(testing.suiteName(), [], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.resetTables(mock, skipping);

  /**
   * Avoid an issue that looks like the following:
   *
   * 17:21:26 requested
   * 17:21:49 check-workers loop fetches worker state
   * 17:22:28 check-workers loop fetches worker state
   * 17:22:48 check-workers loop fetches worker state
   * 17:22:57 registered
   * 17:24:47 checkworker writes
   * ........ repeat
   * 17:55:16 worker is terminated for `terminateAfter` reasons
   *          (terminateAfter being set to exactly 30 minutes after requested)
   */
  test('worker lifecycle data race', async function() {
    const origTerminateAfter = Date.now() + 1800000;
    // First create a "requested worker"
    let w = Worker.fromApi({
      workerPoolId: 'foo/bar',
      workerGroup: 'abc',
      workerId: 'i-123',
      providerId: 'testing',
      capacity: 1,
      providerData: { terminateAfter: origTerminateAfter }, // use a "normal" registrationTimeout value
    });
    w = await w.create(helper.db);

    // Now loop over the existing workers as we do in scanworker
    // we do an initial comparison to ensure they make sense up to this point
    const fetched = Worker.fromDbRows(await helper.db.fns.get_non_stopped_workers_with_launch_config_scanner(
      null, null, null, null, null, 10, 0));

    assert.deepEqual(fetched.serializable(), w.serializable());

    // now we update the worker as if registerWorker happened
    const now = new Date();
    await w.update(helper.db, worker => {
      worker.providerData.terminateAfter = now.getTime() + 50000000;
      worker.state = Worker.states.RUNNING;
      worker.lastModified = now;
    });
    await w.reload(helper.db);
    assert.equal(now.getTime() + 50000000, w.providerData.terminateAfter);

    // now we call update from the workerscanner worker. This _should_ optimistically
    // update the row and not just overwrite the updates from registerWorker
    await fetched.update(helper.db, worker => {
      worker.lastChecked = new Date();
    });

    // The final check that things have worked correctly. If concurrency stuff
    // is messed up this will probably be `origTerminateAfter` instead.
    await w.reload(helper.db);
    assert.equal(now.getTime() + 50000000, w.providerData.terminateAfter);
  });

  test('worker pool error expire', async function () {
    const err1 = WorkerPoolError.fromApi({
      errorId: 'e/id',
      workerPoolId: 'wp/id',
      kind: 'kind',
      title: 'title',
      description: 'description',
    });
    err1.reported = taskcluster.fromNow('-4 days');
    await err1.create(helper.db);

    const err2 = WorkerPoolError.fromApi({
      errorId: 'e/id2',
      workerPoolId: 'wp/id2',
      kind: 'kind',
      title: 'title',
      description: 'description',
    });
    err2.reported = taskcluster.fromNow('-2 days');
    await err2.create(helper.db);

    const count = await WorkerPoolError.expire({ db: helper.db, retentionDays: 3 });
    assert.equal(count, 1);

    const removedError = await WorkerPoolError.get(helper.db, err1.errorId, err1.workerPoolId);
    assert(!removedError);
    const persistedError = await WorkerPoolError.get(helper.db, err2.errorId, err2.workerPoolId);
    assert(persistedError);

    await WorkerPoolError.expire({ db: helper.db, retentionDays: 1 });
    const removedError2 = await WorkerPoolError.get(helper.db, err2.errorId, err2.workerPoolId);
    assert(!removedError2);
  });

  test('WorkerPoolStats', async function () {
    const wps = new WorkerPoolStats('wp/id', {});

    wps.updateFromWorker(new Worker({
      capacity: 1,
      state: Worker.states.REQUESTED,
      launchConfigId: 'lc-1',
    }));

    assert.equal(wps.existingCapacity, 1);
    assert.equal(wps.requestedCapacity, 1);

    wps.updateFromWorker(new Worker({
      capacity: 5,
      state: Worker.states.RUNNING,
      launchConfigId: 'lc-2',
    }));
    wps.updateFromWorker(new Worker({
      capacity: 1,
      state: Worker.states.STOPPING,
      launchConfigId: 'lc-3',
    }));

    assert.equal(wps.existingCapacity, 6);
    assert.equal(wps.requestedCapacity, 1);
    assert.equal(wps.stoppingCapacity, 1);

    assert.equal(wps.capacityByLaunchConfig.get('lc-1'), 1);
    assert.equal(wps.capacityByLaunchConfig.get('lc-2'), 5);
    assert.equal(wps.capacityByLaunchConfig.get('lc-3'), 1);

    assert.deepEqual(wps.forProvision(), {
      existingCapacity: 6,
      requestedCapacity: 1,
      stoppingCapacity: 1,
    });
  });

  test('WorkerPoolStats tracks capacity by workerGroup', async function () {
    const wps = new WorkerPoolStats('wp/id', {});

    // Add workers in us-west-2
    wps.updateFromWorker(new Worker({
      capacity: 2,
      state: Worker.states.REQUESTED,
      workerGroup: 'us-west-2',
      launchConfigId: 'lc-1',
    }));
    wps.updateFromWorker(new Worker({
      capacity: 3,
      state: Worker.states.RUNNING,
      workerGroup: 'us-west-2',
      launchConfigId: 'lc-1',
    }));

    // Add workers in us-east-1
    wps.updateFromWorker(new Worker({
      capacity: 1,
      state: Worker.states.RUNNING,
      workerGroup: 'us-east-1',
      launchConfigId: 'lc-2',
    }));
    wps.updateFromWorker(new Worker({
      capacity: 4,
      state: Worker.states.STOPPING,
      workerGroup: 'us-east-1',
      launchConfigId: 'lc-2',
    }));

    // Verify pool-level stats
    assert.equal(wps.existingCapacity, 6);
    assert.equal(wps.requestedCapacity, 2);
    assert.equal(wps.stoppingCapacity, 4);

    // Verify workerGroup stats
    const byWorkerGroup = wps.forProvisionByWorkerGroup();
    assert.equal(byWorkerGroup.size, 2);

    const usWest2 = byWorkerGroup.get('us-west-2');
    assert.deepEqual(usWest2, {
      existingCapacity: 5,
      requestedCapacity: 2,
      stoppingCapacity: 0,
    });

    const usEast1 = byWorkerGroup.get('us-east-1');
    assert.deepEqual(usEast1, {
      existingCapacity: 1,
      requestedCapacity: 0,
      stoppingCapacity: 4,
    });
  });

  test('WorkerPoolStats workerGroup with quarantined workers', async function () {
    const wps = new WorkerPoolStats('wp/id', {});

    // Add a quarantined worker
    wps.updateFromWorker(new Worker({
      capacity: 5,
      state: Worker.states.RUNNING,
      workerGroup: 'us-west-2',
      quarantineUntil: new Date(Date.now() + 3600000), // 1 hour from now
    }));

    // Add a non-quarantined worker in same region
    wps.updateFromWorker(new Worker({
      capacity: 3,
      state: Worker.states.RUNNING,
      workerGroup: 'us-west-2',
    }));

    // Pool-level: quarantined workers don't count toward existing capacity
    assert.equal(wps.existingCapacity, 3);
    assert.equal(wps.quarantinedCapacity, 5);

    // workerGroup-level: same behavior
    const byWorkerGroup = wps.forProvisionByWorkerGroup();
    const usWest2 = byWorkerGroup.get('us-west-2');
    assert.deepEqual(usWest2, {
      existingCapacity: 3,
      requestedCapacity: 0,
      stoppingCapacity: 0,
    });
  });

  suite('Worker.updateInstanceFields', function() {
    test('preserves queue fields when undefined', function() {
      const worker = Worker.fromApi({
        workerPoolId: 'test/pool',
        workerGroup: 'test-group',
        workerId: 'test-worker',
      });

      // Set queue fields (as loaded from scanner)
      worker.firstClaim = new Date('2025-01-01');
      worker.lastDateActive = new Date('2025-01-02');
      worker.quarantineUntil = new Date('2025-01-03');
      worker.recentTasks = [{ taskId: 'task1' }];

      // Simulate update result (no queue fields)
      const updatedWorker = {
        workerPoolId: 'test/pool',
        workerGroup: 'test-group',
        workerId: 'test-worker',
        providerData: { updated: true }, // Modified field
        // firstClaim, lastDateActive, etc. are undefined
      };

      worker.updateInstanceFields(updatedWorker);

      // Verify queue fields preserved
      assert.deepEqual(worker.firstClaim, new Date('2025-01-01'));
      assert.deepEqual(worker.lastDateActive, new Date('2025-01-02'));
      assert.deepEqual(worker.quarantineUntil, new Date('2025-01-03'));
      assert.deepEqual(worker.recentTasks, [{ taskId: 'task1' }]);

      // Verify workers field updated
      assert.deepEqual(worker.providerData, { updated: true });
    });

    test('allows explicit null for queue fields', function() {
      const worker = Worker.fromApi({});
      worker.firstClaim = new Date('2025-01-01');

      const updatedWorker = {
        firstClaim: null, // Explicitly set to null
      };

      worker.updateInstanceFields(updatedWorker);

      // Null is preserved (not treated as undefined)
      assert.strictEqual(worker.firstClaim, null);
    });
  });
});
