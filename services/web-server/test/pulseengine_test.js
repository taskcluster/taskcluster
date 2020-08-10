const assert = require('assert');
const PulseIterator = require('../src/PulseEngine/PulseIterator');
const testing = require('taskcluster-lib-testing');

// load for side-effects
require('./helper');

class FakePulseEngine {
  subscribe(subscriptions, handleMessage, handleError) {
    this.handleMessage = handleMessage;
    this.handleError = handleError;
    this.subscribed = true;

    return 'subid';
  }

  unsubscribe(subscriptionId) {
    assert.equal(subscriptionId, 'subid');
    this.subscribed = false;
  }
}

suite(testing.suiteName(), function() {
  // pause for "a beat" to let async things filter out; `for await` in particular
  // does not activate immediately
  const beat = () => new Promise(resolve => setTimeout(resolve, 1));

  suite('PulseIterator', function() {
    test('queues up pushed messages', async function() {
      const engine = new FakePulseEngine();
      const pi = new PulseIterator(engine, []);

      assert.equal(engine.subscribed, true, "should have subscribed");

      // first push a bunch of messages..
      const sent = [];
      ['M1', 'M2', 'M3'].forEach((msg) => {
        engine.handleMessage(msg).then(() => sent.push(msg), err => sent.push(err));
      });

      // messages aren't sent yet..
      await beat();
      assert.deepEqual(sent, []);

      // now see that those appear in the output
      const received = [];
      for await (let msg of pi) {
        received.push(msg);
        if (received.length === 3) {
          break;
        }
      }

      assert.equal(engine.subscribed, false, "should have been unsubscribed");
      assert.deepEqual(sent, ['M1', 'M2', 'M3']);
      assert.deepEqual(received, ['M1', 'M2', 'M3']);
    });

    test('waits for pushed messages', async function() {
      const engine = new FakePulseEngine();
      const pi = new PulseIterator(engine, []);

      // start waiting for output before messages arrive..
      const result = [];
      const finished = (async () => {
        for await (let msg of pi) {
          result.push(msg);
          if (result.length === 3) {
            break;
          }
        }
      })();

      await beat();
      assert.deepEqual(result, []);

      await engine.handleMessage('M1');
      await beat();
      assert.deepEqual(result, ['M1']);

      await engine.handleMessage('M2');
      await beat();
      assert.deepEqual(result, ['M1', 'M2']);

      await engine.handleMessage('M3');
      await beat();
      assert.deepEqual(result, ['M1', 'M2', 'M3']);

      await finished;

      assert.equal(engine.subscribed, false, "should have been unsubscribed");
    });

    test('throws errors into the iterator', async function() {
      const engine = new FakePulseEngine();
      const pi = new PulseIterator(engine, []);

      const sent = [];
      engine.handleMessage('M1').then(() => sent.push('M1'));
      assert.deepEqual(sent, []);
      assert.deepEqual(await pi.next(), { value: 'M1', done: false });
      assert.deepEqual(sent, ['M1']);

      // an unsent M2 will error out after handleError is called
      engine.handleMessage('M2')
        .then(() => { throw new Error('unexpected success'); })
        .catch(err => sent.push(err.toString()));
      assert.deepEqual(sent, ['M1']);

      engine.handleError(new Error('uhoh'));

      await beat();
      assert.deepEqual(sent, ['M1', 'Error: iterator cancelled']);

      // the same error should be thrown multiple times..
      for (let i = 0; i < 3; i++) {
        try {
          await pi.next();
          assert(false, "should have failed");
        } catch (err) {
          // expected an 'uhoh' error..
          if (!err.toString().match(/uhoh/)) {
            throw err;
          }
        }
      }

      assert.equal(engine.subscribed, false, "should have been unsubscribed");

      // sending further messages fails
      try {
        await engine.handleMessage('M3');
        assert(false, "should have failed");
      } catch (err) {
        if (!err.toString().match(/iterator cancelled/)) {
          throw err;
        }
      }
    });
  });
});
