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
describe('Iterate', () => {

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

        debug('iterate!');
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

  it('should stop after correct number of iterations', done => {
    let iterations = 0;

    let i = new subject({
      maxIterationTime: 3,
      watchDog: 2,
      waitTime: 1,
      maxIterations: 5,
      handler: async (watchdog, state) => {
        watchdog.on('expired', () => {
          done(new Error('incremental watch dog expiration'));
        });

        debug('iterate!');
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

    i.on('completed', () => {
      assume(iterations).equals(5);
      assume(i.keepGoing).is.not.ok();
      i.stop();
      done();
    });
  });

  it('should emit error when iteration watchdog expires', done => {
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
          assume(i.keepGoing).is.not.ok();
          done();
        });
        return new Promise((res, rej) => {
          setTimeout(res, 2000);
        });

      }
    });

    i.start();
  });

  it('should emit error when overall watchdog expires', done => {
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
      assume(i.keepGoing).is.not.ok();
      done();
    });
  });

  it('should emit error when iteration is too quick', done => {
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
      assume(i.keepGoing).is.not.ok();
      done();
    });
  });

  it('should emit error after too many failures', done => {
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
      assume(i.keepGoing).is.not.ok();
      done();
    });

  });



  it('should cause uncaughtException when error event is unhandled', done => {
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
      assume(i.keepGoing).is.not.ok();
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

  it('should share state between iterations', done => {
    let iterations = 0;
    let v = {a:1};

    let i = new subject({
      maxIterationTime: 3,
      watchDog: 2,
      waitTime: 1,
      maxIterations: 2,
      maxFailures: 1,
      handler: async (watchdog, state) => {
        watchdog.on('expired', () => {
          done(new Error('incremental watch dog expiration'));
        });

        if (iterations === 0) {
          assume(state).deeply.equals({});
          state.v = v;
        } else if (iterations === 1) {
          assume(state.v).deeply.equals(v);
          assume(state.v).equals(v);
        } else {
          done(new Error('too many iterations'));
        }

        debug('iterate!');
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

    i.on('iteration-error', err => {
      done(err);
    });

    i.start();

    i.on('completed', () => {
      assume(iterations).equals(2);
      assume(i.keepGoing).is.not.ok();
      i.stop();
      assume(i.keepGoing).is.not.ok();
      done();
    });
  });
})
