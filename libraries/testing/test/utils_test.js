const assert = require('assert');
const testing = require('taskcluster-lib-testing');

suite(testing.suiteName(), function() {
  test('sleep', async function() {
    const start = new Date().getTime();
    await testing.sleep(10);
    const end = new Date().getTime();
    // as long as it waited 5ms or more we'll call it good..
    assert(end - start > 5, 'did not wait long enough');
  });

  let countDown;
  const pollFunc = () => {
    countDown = 5;
    return async () => {
      await testing.sleep(1);
      countDown -= 1;
      if (countDown === 0) {
        return 'success';
      }
      throw new Error('Something bad');
    };
  };

  test('poll (success)', async function() {
    const poll = pollFunc();
    await testing.poll(poll, 4, 5);
    assert.equal(countDown, 0);
  });

  test('poll (too-few iterations)', async function() {
    const poll = pollFunc();
    try {
      await testing.poll(poll, 3, 5);
    } catch (err) {
      if (!/Something bad/.test(err)) {
        throw err;
      }
      return;
    }
    assert(0, 'Did not get expected exception');
  });
});
