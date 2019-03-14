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
    w.on('started', () => events.push(['started', new Date() - start]));
    w.on('stopped', () => events.push(['stopped', new Date() - start]));
    w.on('touched', () => events.push(['touched', new Date() - start]));
    w.on('expired', () => events.push(['expired', new Date() - start]));
  };

  test('should emit when starting and stopping', function() {
    let w = new subject(10 * 1000);
    listen(w);
    w.start();
    w.stop();
    assume(events).to.deeply.equal([
      ['started', 0],
      ['stopped', 0],
    ]);
  });

  test('should emit when touched', function() {
    let w = new subject(10 * 1000);
    listen(w);
    w.start();
    w.touch();
    w.stop();
    assume(events).to.deeply.equal([
      ['started', 0],
      ['touched', 0],
      ['stopped', 0],
    ]);
  });

  test('should emit expired event', function() {
    let w = new subject(1 * 1000);
    listen(w);
    w.start();
    this.clock.tick(1000);
    assume(events).to.deeply.equal([
      ['started', 0],
      ['expired', 1000],
    ]);
  });

  test('should not expire early', function() {
    let w = new subject(1 * 1000);
    listen(w);
    w.start();
    this.clock.tick(999);
    w.stop();
    assume(events).to.deeply.equal([
      ['started', 0],
      ['stopped', 999],
    ]);
  });

  test('should throw on time', function() {
    let w = new subject(1 * 1000);
    listen(w);
    w.start();
    this.clock.tick(1000);
    w.stop();
    assume(events).to.deeply.equal([
      ['started', 0],
      ['expired', 1000],
      ['stopped', 1000],
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
      ['started', 0],
      ['touched', 999],
      ['touched', 1998],
      ['expired', 2998],
      ['stopped', 2998],
    ]);
  });
});
