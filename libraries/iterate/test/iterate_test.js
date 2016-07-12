let subject = require('../');
let sinon = require('sinon');
let assume = require('assume');
let debug = require('debug')('iterate-test');

describe('iteration functionality', () => {
  let sandbox;
  let clock;

  beforeEach(() => {
    sandbox = sinon.sandbox.create({
      useFakeTimers: true,
    });
    clock = sandbox.clock;
  });

  afterEach(() => {
    sandbox.restore();
  });
});


// I split out tests that verify that all the looping stuff works as expected.
// I'd rather use fake timers, but there are lots of timeouts involved and I
// couldn't get it to play nice
describe('timing tests', () => {
  it('should be able to start and stop', done => {
    let iterations = 0;

    let i = new subject({
      maxIterationTime: 3,
      watchDog: 2,
      waitTime: 1,
      handler: async (watchdog, state) => {
        // In order to get the looping stuff to work, I had to stop the
        // watchdog timer.  This will be tested in the tests for the
        // Iterate.iterate method
        watchdog.on('expired', () => {
          done(new Error('incremental watch dog expiration'));
        });

        i.on('error', err => {
          done(err);
        });

        console.log('iterate!');
        iterations++;
        return 1;
      }
    });


    i.overallWatchDog.on('expired', () => {
      done(new Error('overall watchdog expiration'));
    });

    i.on('error', err => {
      done(err);
    });

    i.start();

    setTimeout(() => {
      assume(iterations).equals(5);
      assume(i.currentIteration).equals(5);
      assume(i.keepGoing).is.ok();
      i.stop();
      assume(i.keepGoing).is.not.ok();
      done();
    }, 5000);
  });

  it('should error when iteration watchdog expires', done => {
    let iterations = 0;

    let i = new subject({
      maxIterationTime: 5,
      watchDog: 1,
      waitTime: 1,
      handler: async (watchdog, state) => {
        // In order to get the looping stuff to work, I had to stop the
        // watchdog timer.  This will be tested in the tests for the
        // Iterate.iterate method
        i.on('error', err => {
          assume(i.currentIteration).equals(0);
          debug('correctly getting expired watchdog timer');
          i.stop();
          done();
        });
        return new Promise((res, rej) => {
          setTimeout(res, 2000);
        });

      }
    });

    i.start();
  });

  it('should error when overall watchdog expires', done => {
    let iterations = 0;

    let i = new subject({
      maxIterationTime: 1,
      watchDog: 1,
      waitTime: 1,
      handler: async (watchdog, state) => {
        watchdog.stop();
        return new Promise((res, rej) => {
          setTimeout(res, 5000);
        });
      }
    });

    i.start();

    i.on('error', err => {
      i.stop();
      done();
    });
  });

  it('should error when iteration is too quick', done => {
    let iterations = 0;

    let i = new subject({
      maxIterationTime: 12,
      minIterationTime: 10,
      watchDog: 10,
      waitTime: 1,
      handler: async (watchdog, state) => {
        watchdog.stop();
        return 1;
      }
    });

    i.start();

    i.on('error', err => {
      debug('correctly getting expired watchdog timer');
      i.stop();
      done();
    });
  });

  it('should do fail when there are too many failures', done => {
    let iterations = 0;

    let i = new subject({
      maxIterationTime: 12,
      maxFailures: 1,
      watchDog: 10,
      waitTime: 1,
      handler: async (watchdog, state) => {
        return new Promise((res, rej) => {
          rej(new Error('hi'));
        });
      }
    });

    i.start();
    
    i.on('error', err => {
      i.stop();
      done();
    });

  });



  it('should do something when errors are not handled', done => {
    let iterations = 0;

    // NOTE: Mocha has it's own uncaught exception listener.  If we were to
    // leave it in force during this test, we'd end up getting two results from
    // the test.  One failure from the mocha handler and one pass from our own
    // handler.  This is obviously not ideal, and it's sort of a risk that we
    // mess up the uncaught exception handling for future tests

    let origListeners = process.listeners('uncaughtException');
    process.removeAllListeners('uncaughtException');

    let uncaughtHandler = function (err) {
      process.removeAllListeners('uncaughtException');
      for (let listener of origListeners) {
        process.on('uncaughtException', listener);
      }
      i.stop();
      done();
    };

    process.on('uncaughtException', uncaughtHandler);

    let i = new subject({
      maxIterationTime: 12,
      maxFailures: 1,
      watchDog: 10,
      waitTime: 1,
      handler: async (watchdog, state) => {
        return new Promise((res, rej) => {
          rej(new Error('hi'));
        });
      }
    });

    i.start();

  });



})
