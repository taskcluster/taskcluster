let subject = require('../lib/watchdog');
let sinon = require('sinon');
let assume = require('assume');

suite('watchdog', function() {
  setup(function() {
    this.clock = sinon.useFakeTimers();
    sinon.stub(process, 'exit');
    process.exit.throws(new Error('process.exit'));
  });

  teardown(function() {
    this.clock.restore();
    process.exit.restore();
  });

  test('should emit when starting', function(done) {
    let w = new subject(10 * 1000);
    w.on('started', function() {
      done();
    });
    w.start();
    w.stop();
  });

  test('should emit when touched', function(done) {
    let w = new subject(10 * 1000);
    w.on('touched', function() {
      done();
    });
    w.start();
    w.touch();
    w.stop();
  });

  test('should emit when stopped', function(done) {
    let w = new subject(10 * 1000);
    w.on('stopped', function() {
      done();
    });
    w.start();
    w.stop();
  });

  test('should emit expired event', function(done) {
    let w = new subject(1 * 1000);
    w.on('expired', () => {
      done();
    });
    w.start();
    this.clock.tick(1000);
  });

  test('should not throw early', function() {
    let w = new subject(1 * 1000);
    w.start();
    this.clock.tick(999);
    w.stop();
  });

  test('should throw on time', function() {
    let w = new subject(1 * 1000);
    w.start();
    assume(() => {
      this.clock.tick(1000);
    }).throws('process.exit');
    w.stop();
  });

  test('touching should reset timer', function() {
    let w = new subject(1 * 1000);
    w.start();
    // We do this three times to ensure that the
    // time period stays constant and doesn't grow
    // or shrink over time
    this.clock.tick(999);
    w.touch();
    this.clock.tick(999);
    w.touch();
    this.clock.tick(999);
    assume(() => {
      this.clock.tick(1);
    }).throws('process.exit');
    w.stop();
  });
});
