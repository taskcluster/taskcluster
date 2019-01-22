'use strict';

const assume = require('assume');
const {Provider} = require('../../lib/provider');
const {Bid} = require('../../lib/bid');
const {Worker} = require('../../lib/worker');
const sinon = require('sinon');

/****************
 *              *
 *    NOTE!     *
 *              *
 ****************
 *
 * This code has not been tested against a real provider, so it is expected
 * that fixes will be needed
 */

const workerType = 'workerType';

/**
 * Test a Provider.  `runBefore` and `runAfter` are methods which will be run
 * before and after the tests complete.  They are named so as not to conflict
 * with any mocha tdd/bdd interface methods.  These methods will be run with
 * the await keyword and will be run with the instance of `clazz` as the only
 * parameter.
 *
 * In pseudo code, these setup and teardown methods will be run like:
 * await runBefore(subject);
 * ... (tests)
 * await runAfter(subject);
 *
 * The assumption is that these tests can safely call the api methods as many
 * times as needed and nothing will happen externally.  In otherwords, the
 * provider must be fully mocked.
 *
 * The provided workerConfiguration must be a valid worker configuration for this
 * provider.
 *
 * The provider will be tested with a worker type called 'workerType' and should
 * have a worker with id 'tracked-worker' which is in `Provider.running` state
 * and no worker with id 'cannot-exist'.  It must always propose bids
 *
 */
function testProvider(subject, workerConfiguration, runBefore, runAfter) {
  suite(`Provider API Conformance for ${subject.constructor.name}`, () => {
    let workerType = 'workerType';
    let sandbox = sinon.createSandbox();

    setup(async () => {
      if (runBefore) {
        await runBefore(subject);
      }
    });

    teardown(async () => {
      if (runAfter) {
        await runAfter(subject);
      }
    });

    test('instance is subclass of Provider', async () => {
      assume(subject).inherits(Provider);
    });

    test('all api mandated methods exist', async () => {
      assume(subject.listWorkers).is.a('asyncfunction');
      assume(subject.queryWorkerState).is.a('asyncfunction');
      assume(subject.workerInfo).is.a('function');
      assume(subject.initiate).is.a('asyncfunction');
      assume(subject.terminate).is.a('asyncfunction');
      assume(subject.proposeBids).is.a('asyncfunction');
      assume(subject.submitBids).is.a('asyncfunction');
      assume(subject.rejectBids).is.a('asyncfunction');
      assume(subject.terminateAllWorkers).is.a('asyncfunction');
      assume(subject.terminateWorkerType).is.a('asyncfunction');
      assume(subject.terminateWorkers).is.a('asyncfunction');
    });

    test('.listWorkers() should work as specified', async () => {
      let workers = await subject.listWorkers({
        states: [Provider.running],
        workerTypes: [workerType],
      });

      for (let worker of workers) {
        assume(worker).inherits(Worker);
      }

      await assume(() => {
        return subject.listWorkers({states: ['invalid'], workerTypes: [workerType]}); 
      }).rejects();
    });

    test('.queryWorkerState() should work as specified', async () => {
      let workerState = await subject.queryWorkerState({workerId: 'cannot-exist'});
      assume(workerState).is.an('undefined');

      workerState = await subject.queryWorkerState({workerId: 'tracked-worker'});
      assume(workerState).equals(Provider.running);
    });

    test('.workerInfo() should work as specified', async () => {
      let [worker] = await subject.listWorkers({
        states: [Provider.running],
        workerTypes: [workerType],
      });
      assume(subject.workerInfo({worker})).is.an('object');
    });

    test('.proposeBids() should work as specified', async () => {
      let bids = await subject.proposeBids({
        workerType,
        workerConfiguration,
        demand: 10,
      });

      assume(bids).not.empty()

      for (let bid of bids) {
        assume(bid).inherits(Bid);
      }

    });

    test('.submitBids() should work as specified', async () => {
      let bids = await subject.proposeBids({
        workerType,
        workerConfiguration,
        demand: 10,
      });

      await subject.submitBids({bids});
    });

    test('.rejectBids() should work as specified', async () => {
      let bids = await subject.proposeBids({
        workerType,
        workerConfiguration,
        demand: 10,
      });

      await subject.rejectBids({bids});
    });

    test('.terminateAllWorkers() should work as specified', async () => {
      await subject.terminateAllWorkers();
    });

    test('.terminateWorkerType() should work as specified', async () => {
      await subject.terminateWorkerType({workerType});
    });

    test('.terminateWorker() should work as specified', async () => {
      let [worker] = await subject.listWorkers({
        states: [Provider.running],
        workerTypes: [workerType],
      });

      await subject.terminateWorker({workers: [worker]});
      await subject.terminateWorker({workers: [worker.id]});
    });

  });
}

module.exports = {
  testProvider,
}
