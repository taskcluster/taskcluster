const assert = require('assert');
const helper = require('./helper');
const _ = require('lodash');
const testing = require('taskcluster-lib-testing');
const { Worker, WorkerPool } = require('../src/data');

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
    const fetched = Worker.fromDbRows(await helper.db.fns.get_non_stopped_workers_quntil_providers(
      null, null, null, null, null, 10, 0));

    // remove properties that come from queue_workers table
    delete fetched.firstClaim;
    delete fetched.recentTasks;
    delete fetched.lastDateActive;
    delete fetched._properties.firstClaim;
    delete fetched._properties.recentTasks;
    delete fetched._properties.lastDateActive;
    assert.deepEqual(fetched, w);

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

  suite('worker pool', () => {
    const testPairs = [
      ['unknown type', 'unknown', {
        workerPoolId: 'who-knows',
        config: {
          minCapacity: 1,
          maxCapacity: 2,
        },
      }],
      ['possibly docker', 'docker-worker', {
        workerPoolId: 'possibly-docker',
        config: {
          minCapacity: 1,
          maxCapacity: 2,
          launchConfigs: [{
            region: 'de-west-9',
            workerConfig: {},
          }, {
            region: 'us-east-1',
            workerConfig: {
              capacity: 1,
            },
          }],
        },
      }],
      ['probably not generic', 'docker-worker', {
        workerPoolId: 'maybe-not-generic',
        config: {
          minCapacity: 1,
          maxCapacity: 2,
          launchConfigs: [{
            region: 'us-east-1',
            ImageId: 'ami-docker-disguised-as-generic',
            workerConfig: {
              capacity: 1,
              genericWorker: {
                config: {
                  deploymentId: '/tmp',
                },
              },
            },
          }],
        },
      }],
      ['clearly generic', 'generic-worker', {
        workerPoolId: 'clearly-generic',
        config: {
          minCapacity: 1,
          maxCapacity: 2,
          launchConfigs: [{
            region: 'us-east-1',
            workerConfig: {
              capacity: 1,
              genericWorker: {
                config: {
                  tasksDir: '/tmp',
                  cachesDir: '/proc',
                  downloadsDir: '/dev',
                },
              },
            },
          }],
        },
      }],
    ];
    testPairs.forEach(([name, type, cfg]) => test(`guessWorkerImplementation: ${name}`, () => {
      const wp = new WorkerPool(cfg);
      assert.equal(wp.guessWorkerImplementation(), type);
    }));
  });
});
