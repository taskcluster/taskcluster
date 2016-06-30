var subject = require('../lib/watchdog');
var sinon = require('sinon');
var assume = require('assume');

describe('watchdog', function() {
  beforeEach(function() {
    this.clock = sinon.useFakeTimers();
    sinon.stub(process, 'exit');
    process.exit.throws(new Error('process.exit'));
  });

  afterEach(function() {
    this.clock.restore();
    process.exit.restore();
  });

  it('should emit when starting', function(done) {
    var w = new subject(10);
    w.on('started', function() {
      done();
    });
    w.start();
    w.stop();
  });

  it('should emit when touched', function(done) {
    var w = new subject(10);
    w.on('touched', function() {
      done();
    });
    w.start();
    w.touch();
    w.stop();
  });

  it('should emit when stopped', function(done) {
    var w = new subject(10);
    w.on('stopped', function() {
      done();
    });
    w.start();
    w.stop();
  });

  it('should emit expired event', function(done) {
    var w = new subject(1);
    w.on('expired', () => {
      done();
    });
    w.start();
    this.clock.tick(1000);
  });

  it('should not throw early', function() {
    var w = new subject(1);
    w.start();
    this.clock.tick(999);
    w.stop();
  });

  it('should throw on time', function() {
    var w = new subject(1);
    w.start();
    assume(() => {
      this.clock.tick(1000);
    }).throws('process.exit');
    w.stop();
  });

  it('touching should reset timer', function() {
    var w = new subject(1);
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
