import assume from 'assume';
import HintPoller from '../src/hintpoller.js';
import helper from './helper.js';
import testing from 'taskcluster-lib-testing';

helper.secrets.mockSuite(testing.suiteName(), [], function(mock, skipping) {
  test('calls pollPendingQueue', async () => {
    const monitor = await helper.load('monitor');

    let pollCalls = 0;
    const pollPendingQueue = async (count) => {
      pollCalls += count;
      return [count];
    };

    const hintPoller = new HintPoller('taskQueue/Id', {
      monitor,
      pollPendingQueue,
      onError: err => console.error(err),
      onDestroy: () => {},
    });

    const aborted = new Promise(resolve => setTimeout(resolve, 100));
    const hints = await hintPoller.requestClaim(1, aborted);

    assume(hints).deep.equals([1]);
    assume(pollCalls).equals(1);
  });

  test('cannot request claim after destroy', async () => {
    const monitor = await helper.load('monitor');

    let pollCalls = 0;
    const pollPendingQueue = async (count) => {
      pollCalls += count;
      return [count];
    };

    let destroyCalled = false;

    const hintPoller = new HintPoller('taskQueue/Id', {
      monitor,
      pollPendingQueue,
      onError: err => console.error(err),
      onDestroy: () => destroyCalled = true,
    });

    const aborted = new Promise(resolve => setTimeout(resolve, 1000));

    hintPoller.destroy();
    try {
      await hintPoller.requestClaim(1, aborted);
      assume(true).equals(false); // this should not happen
    } catch (err) {
      assume(err.message).equals('requestClaim() called after destroy()');
    }
    assume(pollCalls).equals(0);
    assume(destroyCalled).equals(true);
  });

  test('multiple listeners', async () => {
    const monitor = await helper.load('monitor');

    let pollCalls = 0;
    const pollPendingQueue = async (count) => {
      pollCalls += 1;
      return [count];
    };

    const hintPoller = new HintPoller('taskQueue/Id', {
      monitor,
      pollPendingQueue,
      onError: err => console.error(err),
      onDestroy: () => {},
    });

    const aborted = new Promise(resolve => setTimeout(resolve, 100));
    const hints1 = await hintPoller.requestClaim(1, aborted);
    const hints2 = await hintPoller.requestClaim(1, aborted);

    assume(hints1).deep.equals([1]);
    assume(hints2).deep.equals([1]);
    assume(pollCalls).equals(2);
  });

  test('releases unused hints', async () => {
    const monitor = await helper.load('monitor');

    let pollCalls = 0;
    let released = false;
    const pollPendingQueue = async (count) => {
      pollCalls += 1;
      return [{
        count,
        // first hint will be claimed
      }, {
        count,
        // second hint will be released
        release: () => released = true,
      }];
    };

    const hintPoller = new HintPoller('taskQueue/Id', {
      monitor,
      pollPendingQueue,
      onError: err => console.error(err),
      onDestroy: () => {},
    });

    const aborted = new Promise(resolve => setTimeout(resolve, 100));
    // we request 1 but pollPendingQueue returns 2
    // so second one would be released back
    await hintPoller.requestClaim(1, aborted);
    assume(pollCalls).equals(1);
    assume(released).equals(true);

    released = false;
    await hintPoller.requestClaim(2, aborted);
    assume(pollCalls).equals(2);
    assume(released).equals(false); // since 2 were requested
  });
});
