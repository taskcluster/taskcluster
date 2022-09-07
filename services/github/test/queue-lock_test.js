const assert = require('assert');
const testing = require('taskcluster-lib-testing');
const QueueLock = require('../src/queue-lock');

suite(testing.suiteName(), function() {
  suite('Lock', function() {
    test('should lock by name', async function () {
      const lock = new QueueLock();

      let counter = 0;
      const coroutine = async () => {
        await lock.acquire('t1');
        counter ++;
        lock.release('t1');
      };

      await coroutine();
      assert.equal(1, counter);

      const more = [
        coroutine(),
        coroutine(),
        coroutine(),
        coroutine(),
      ];

      assert.equal(1, counter);
      await Promise.all(more);
      assert.equal(5, counter);
    });
    test('should run sequentially and not block other locks', async function () {
      const lock = new QueueLock();
      let results = [];
      const coroutine = async (name, result) => {
        await lock.acquire(name);
        results.push(result);
        lock.release(name);
      };

      await Promise.all([
        coroutine('lock1', 1),
        coroutine('lock1', 2),
        coroutine('lock1', 3),
        coroutine('lock1', 4),
        coroutine('lock1', 5),
      ]);
      assert.deepEqual([1, 2, 3, 4, 5], results);

      results = [];
      await Promise.all([
        coroutine('lock1', 1),
        coroutine('lock2', 2),
        coroutine('lock2', 3),
        coroutine('lock1', 4),
      ]);

      assert.deepEqual([1, 2, 4, 3], results);
    });
  });
});
