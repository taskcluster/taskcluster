const assert = require('assert');
const helper = require('./helper');
const _ = require('lodash');
const testing = require('taskcluster-lib-testing');
const { Worker } = require('../src/data');

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
    const fetched = Worker.fromDbRows(await helper.db.fns.get_non_stopped_workers_quntil(null, null, null, 10, 0));
    assert.deepEqual(fetched, w);

    // now we update the worker as if registerWorker happened
    const now = new Date();
    await w.update(helper.db, worker => {
      worker.providerData.terminateAfter = now.getTime() + 50000000;
      worker.state = Worker.states.RUNNING,
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

});
