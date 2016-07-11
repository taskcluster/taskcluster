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

        console.log('iterate!');
        iterations++;
        return 1;
      }
    });

    i.start();

    i.overallWatchDog.on('expired', () => {
      done(new Error('overall watchdog expiration'));
    });

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
        watchdog.on('expired', () => {
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

    i.overallWatchDog.on('expired', () => {
      done(new Error('overall watchdog expiration'));
    });

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

    i.overallWatchDog.on('expired', () => {
      debug('correctly getting expired watchdog timer');
      i.stop();
      done();
    });



  });



})
