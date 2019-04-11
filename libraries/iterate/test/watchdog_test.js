const subject = require('../src/watchdog');
const assume = require('assume');
const testing = require('taskcluster-lib-testing');

suite(testing.suiteName(), function() {
  let events;

  const runWithFakeTime = fn => {
    return testing.runWithFakeTime(fn, {
      systemTime: 0,
    });
  };

  const listen = w => {
    events = [];
    w.on('expired', () => events.push(['expired', +new Date()]));
  };

  test('should emit expired event', runWithFakeTime(async function() {
    const w = new subject(1 * 1000);
    listen(w);
    w.start();
    await testing.sleep(1000);
    assume(events).to.deeply.equal([
      ['expired', 1000],
    ]);
  }));

  test('should not expire early', runWithFakeTime(async function() {
    const w = new subject(1 * 1000);
    listen(w);
    w.start();
    await testing.sleep(999);
    w.stop();
    assume(events).to.deeply.equal([]);
  }));

  test('should expire on time', runWithFakeTime(async function() {
    const w = new subject(1 * 1000);
    listen(w);
    w.start();
    await testing.sleep(1000);
    w.stop();
    assume(events).to.deeply.equal([
      ['expired', 1000],
    ]);
  }));

  test('should not expire twice', runWithFakeTime(async function() {
    const w = new subject(1 * 1000);
    listen(w);
    w.start();
    await testing.sleep(3000);
    w.stop();
    assume(events).to.deeply.equal([
      ['expired', 1000],
    ]);
  }));

  test('touching should reset timer', runWithFakeTime(async function() {
    const w = new subject(1 * 1000);
    listen(w);
    w.start();
    // We do this three times to ensure that the
    // time period stays constant and doesn't grow
    // or shrink over time
    await testing.sleep(999);
    w.touch();
    await testing.sleep(999);
    w.touch();
    await testing.sleep(1000);
    w.stop();
    assume(events).to.deeply.equal([
      ['expired', 2998],
    ]);
  }));
});
