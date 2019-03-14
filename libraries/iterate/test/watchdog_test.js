let subject = require('../src/watchdog');
let sinon = require('sinon');
let assume = require('assume');

suite('watchdog', function() {
  let events, start;

  setup(function() {
    this.clock = sinon.useFakeTimers();
    start = new Date();
  });

  teardown(function() {
    this.clock.restore();
  });

  const listen = w => {
    events = [];
    w.on('expired', () => events.push(['expired', new Date() - start]));
  };

  test('should emit expired event', function() {
    let w = new subject(1 * 1000);
    listen(w);
    w.start();
    this.clock.tick(1000);
    assume(events).to.deeply.equal([
      ['expired', 1000],
    ]);
  });

  test('should not expire early', function() {
    let w = new subject(1 * 1000);
    listen(w);
    w.start();
    this.clock.tick(999);
    w.stop();
    assume(events).to.deeply.equal([]);
  });

  test('should expire on time', function() {
    let w = new subject(1 * 1000);
    listen(w);
    w.start();
    this.clock.tick(1000);
    w.stop();
    assume(events).to.deeply.equal([
      ['expired', 1000],
    ]);
  });

  test('should not expire twice', function() {
    let w = new subject(1 * 1000);
    listen(w);
    w.start();
    this.clock.tick(1000);
    this.clock.tick(1000);
    this.clock.tick(1000);
    w.stop();
    assume(events).to.deeply.equal([
      ['expired', 1000],
    ]);
  });

  test('touching should reset timer', function() {
    let w = new subject(1 * 1000);
    listen(w);
    w.start();
    // We do this three times to ensure that the
    // time period stays constant and doesn't grow
    // or shrink over time
    this.clock.tick(999);
    w.touch();
    this.clock.tick(999);
    w.touch();
    this.clock.tick(999);
    this.clock.tick(1);
    w.stop();
    assume(events).to.deeply.equal([
      ['expired', 2998],
    ]);
  });
});
