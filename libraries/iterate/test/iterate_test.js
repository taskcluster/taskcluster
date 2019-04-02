let subject = require('../');
let sandbox = require('sinon').createSandbox();
let assume = require('assume');
let debug = require('debug')('iterate-test');
let MonitorManager = require('taskcluster-lib-monitor');
let testing = require('taskcluster-lib-testing');

let possibleEvents = [
  'started',
  'stopped',
  'completed',
  'iteration-start',
  'iteration-success',
  'iteration-failure',
  'iteration-complete',
  'error',
];

class IterateEvents {
  constructor(iterator, expectedOrder) {
    this.iterator = iterator;
    this.expectedOrder = expectedOrder;
    this.orderOfEmission = [];
    for (let x of possibleEvents) {
      iterator.on(x, () => {
        this.orderOfEmission.push(x);
      });
    }
  }

  assert() {
    let dl = () => { // dl === dump list
      return `\nExpected: ${JSON.stringify(this.expectedOrder, null, 2)}` +
        `\nActual: ${JSON.stringify(this.orderOfEmission, null, 2)}`;
    };

    if (this.orderOfEmission.length !== this.expectedOrder.length) {
      throw(new Error(`order emitted differs in length from expectation ${dl()}`));
    }

    for (let i = 0 ; i < this.orderOfEmission.length ; i++) {
      if (this.orderOfEmission[i] !== this.expectedOrder[i]) {
        throw(new Error(`order emitted differs in content ${dl()}`));
      }
    }

    debug(`Events Emitted: ${JSON.stringify(this.orderOfEmission)}`);
  }
}

suite(testing.suiteName(), () => {
  let manager;
  let monitor;

  suiteSetup(async () => {
    manager = new MonitorManager({serviceName: 'iterate'});
    manager.setup({mock: true});
    monitor = manager.monitor();
  });

  suiteTeardown(() => {
    manager.terminate();
  });

  teardown(() => {
    sandbox.restore();
  });

  test('should be able to start and stop', testing.runWithFakeTime(async function() {
    let iterations = 0;

    let i = new subject({
      maxIterationTime: 3000,
      waitTime: 1000,
      watchDog: 0,
      handler: async (watchdog, state) => {
        debug('iterate!');
        iterations++;
        return 1;
      },
      monitor,
    });

    let err = null;
    i.on('error', e => { err = e; });
    i.on('stopped', () => { err = new Error('unexpected stopped event'); });

    i.start();

    await testing.sleep(5000);

    assume(err).to.equal(null);
    assume(iterations).equals(5);
    assume(i.keepGoing).is.ok();
    i.stop();
    assume(i.keepGoing).is.not.ok();
    assume(manager.messages.length).equals(5);
    manager.messages.forEach(message => {
      assume(message.Fields.status).equals('success');
    });
  }));

  test('should stop after correct number of iterations', testing.runWithFakeTime(async function() {
    let iterations = 0;

    let i = new subject({
      maxIterationTime: 3000,
      waitTime: 10,
      maxIterations: 5,
      watchDog: 0,
      handler: async (watchdog, state) => {
        debug('iterate!');
        iterations++;
        return 1;
      },
    });

    i.start();

    await new Promise(resolve => {
      i.on('completed', resolve);
    });

    assume(iterations).equals(5);
    assume(i.keepGoing).is.not.ok();
    i.stop();
  }));

  test('should emit error when iteration watchdog expires', testing.runWithFakeTime(async function() {
    let i = new subject({
      maxIterationTime: 5000,
      watchdogTime: 1000,
      waitTime: 1000,
      maxFailures: 1,
      handler: async (watchdog, state) => {
        return testing.sleep(2000);
      },
    });

    let err = null;
    i.on('error', e => { err = e; });

    i.start();
    await testing.sleep(1500);
    i.stop();

    assume(i.keepGoing).is.not.ok();
    assume(err).matches(/watchdog exceeded/);
  }));

  test('should emit error when overall iteration limit is hit', testing.runWithFakeTime(async function() {
    let i = new subject({
      maxIterationTime: 1000,
      waitTime: 1000,
      maxFailures: 1,
      handler: async (watchdog, state) => {
        watchdog.stop();
        return new Promise((res, rej) => {
          setTimeout(() => {
            return res();
          }, 5000);
        });
      },
    });

    let err = null;
    i.on('error', e => { err = e; });

    i.start();
    await testing.sleep(1500);
    i.stop();

    assume(i.keepGoing).is.not.ok();
    assume(err).matches(/Iteration exceeded maximum time allowed/);
  }));

  test('should emit iteration-failure when async handler fails', testing.runWithFakeTime(async function() {
    let i = new subject({
      maxIterationTime: 1000,
      waitTime: 1000,
      maxFailures: 100,
      handler: async (watchdog, state) => {
        throw new Error('uhoh');
      },
    });

    let sawEvent = false;
    i.on('iteration-failure', () => { sawEvent = true; });

    i.start();
    await testing.sleep(500);
    i.stop();

    assume(i.keepGoing).is.not.ok();
    assume(sawEvent).is.ok();
  }));

  test('should emit iteration-failure when sync handler fails', testing.runWithFakeTime(async function() {
    let i = new subject({
      maxIterationTime: 1000,
      waitTime: 1000,
      maxFailures: 100,
      handler: (watchdog, state) => {
        throw new Error('uhoh');
      },
    });

    let sawEvent = false;
    i.on('iteration-failure', () => { sawEvent = true; });

    i.start();
    await testing.sleep(500);
    i.stop();

    assume(i.keepGoing).is.not.ok();
    assume(sawEvent).is.ok();
  }));

  test('should emit iteration-failure when iteration is too quick', testing.runWithFakeTime(async function() {
    let i = new subject({
      maxIterationTime: 12000,
      minIterationTime: 10000,
      waitTime: 1000,
      watchDog: 0,
      handler: async (watchdog, state) => {
        await testing.sleep(100);
      },
    });

    let iterFailed = false;
    i.on('iteration-failure', () => { iterFailed = true; });

    i.start();
    await testing.sleep(300);
    i.stop();

    assume(iterFailed).is.ok();
  }));

  test('should emit error after too many failures', testing.runWithFakeTime(async function() {
    let i = new subject({
      maxIterationTime: 12000,
      maxFailures: 1,
      waitTime: 1000,
      handler: async (watchdog, state) => {
        throw new Error('uhoh');
      },
    });

    let err = null;
    i.on('error', e => { err = e; });

    i.start();
    await testing.sleep(1500);
    i.stop();

    assume(i.keepGoing).is.not.ok();
    // yep, err is an Array..
    assume(err.length).equals(1);
    assume(err[0]).matches(/uhoh/);
  }));

  test('should cause uncaughtException when error event is unhandled', done => {
    // NOTE: Mocha has it's own uncaught exception listener.  If we were to
    // leave it in force during this test, we'd end up getting two results from
    // the test.  One failure from the mocha handler and one pass from our own
    // handler.  This is obviously not ideal, and it's sort of a risk that we
    // mess up the uncaught exception handling for future tests

    let origListeners = process.listeners('uncaughtException');
    process.removeAllListeners('uncaughtException');

    let uncaughtHandler = function(err) {
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
      maxIterationTime: 12000,
      maxFailures: 1,
      waitTime: 1000,
      handler: async (watchdog, state) => {
        return new Promise((res, rej) => {
          rej(new Error('hi'));
        });
      },
    });

    i.start();

  });

  test('should share state between iterations', testing.runWithFakeTime(async function() {
    let iterations = 0;

    let i = new subject({
      maxIterationTime: 3000,
      waitTime: 10,
      maxIterations: 20,
      maxFailures: 1,
      watchDog: 0,
      handler: async (watchdog, state) => {
        if (!state.v) {
          state.v = {count: 0};
        }
        assume(state.v.count === iterations);
        state.v.count += 1;
        iterations += 1;
      },
    });

    let iterFailed = false;
    i.on('iteration-failure', () => { iterFailed = true; });

    i.start();
    await testing.sleep(3000);

    assume(iterations).equals(20);
    assume(i.keepGoing).is.not.ok();
    i.stop();
    assume(i.keepGoing).is.not.ok();
    assume(iterFailed).is.not.ok();
  }));

  test('should emit correct events for single iteration', testing.runWithFakeTime(async function() {
    let i = new subject({
      maxIterationTime: 3000,
      waitTime: 1000,
      handler: async (watchdog, state) => {
        debug('iterate!');
      },
    });

    let events = new IterateEvents(i, [
      'started',
      'iteration-start',
      'iteration-success',
      'iteration-complete',
      'stopped',
    ]);

    i.start();

    // stop and wait for the stop to take effect..
    await new Promise(resolve => {
      i.on('stopped', resolve);
      i.stop();
    });

    events.assert();
  }));

  test('should emit correct events with maxIterations', testing.runWithFakeTime(async function() {
    let i = new subject({
      maxIterationTime: 3000,
      maxIterations: 1,
      waitTime: 1000,
      handler: async (watchdog, state) => {
        debug('iterate!');
      },
    });

    let events = new IterateEvents(i, [
      'started',
      'iteration-start',
      'iteration-success',
      'iteration-complete',
      'completed',
      'stopped',
    ]);

    i.start();

    // stop and wait for the stop to take effect..
    await new Promise(resolve => {
      i.on('stopped', resolve);
      i.stop();
    });

    events.assert();
  }));

  suite('event emission ordering', () => {

    test('should be correct with maxFailures and maxIterations', testing.runWithFakeTime(async function() {
      let i = new subject({
        maxIterationTime: 3000,
        maxIterations: 1,
        maxFailures: 1,
        waitTime: 1000,
        handler: async (watchdog, state) => {
          debug('iterate!');
          throw new Error('hi');
        },
      });

      let events = new IterateEvents(i, [
        'started',
        'iteration-start',
        'iteration-failure',
        'iteration-complete',
        'completed',
        'stopped',
        'error',
      ]);

      i.on('started', () => {
        i.stop();
      });

      await new Promise(resolve => {
        i.on('error', resolve);
        i.start();
      });

      events.assert();
    }));

    test('should be correct with maxFailures only', testing.runWithFakeTime(async function() {
      let i = new subject({
        maxIterationTime: 3000,
        maxFailures: 1,
        waitTime: 1000,
        handler: async (watchdog, state) => {
          debug('iterate!');
          throw new Error('hi');
        },
      });

      let events = new IterateEvents(i, [
        'started',
        'iteration-start',
        'iteration-failure',
        'iteration-complete',
        'stopped',
        'error',
      ]);

      i.on('started', () => {
        i.stop();
      });

      await new Promise(resolve => {
        i.on('error', resolve);
        i.start();
      });

      events.assert();
    }));

    test('should be correct when handler takes too little time', testing.runWithFakeTime(async function() {
      let i = new subject({
        maxIterationTime: 3000,
        minIterationTime: 100000,
        maxFailures: 1,
        waitTime: 1000,
        handler: async (watchdog, state) => {
          return true;
        },
      });

      let events = new IterateEvents(i, [
        'started',
        'iteration-start',
        'iteration-failure',
        'iteration-complete',
        'stopped',
        'error',
      ]);

      i.on('started', () => {
        i.stop();
      });

      await new Promise(resolve => {
        i.on('error', resolve);
        i.start();
      });

      events.assert();
    }));

    test('should be correct when handler takes too long (incremental watchdog)', testing.runWithFakeTime(async function() {
      let i = new subject({
        maxIterationTime: 5000,
        maxFailures: 1,
        watchdogTime: 100,
        waitTime: 1000,
        handler: async (watchdog, state) => {
          await testing.sleep(3000);
        },
      });

      let events = new IterateEvents(i, [
        'started',
        'iteration-start',
        'iteration-failure',
        'iteration-complete',
        'stopped',
        'error',
      ]);

      i.on('started', () => {
        i.stop();
      });

      await new Promise(resolve => {
        i.on('error', resolve);
        i.start();
      });

      events.assert();
    }));

    test('should be correct when handler takes too long (overall time)', testing.runWithFakeTime(async function() {
      let i = new subject({
        maxIterationTime: 3000,
        maxFailures: 1,
        waitTime: 1000,
        handler: async (watchdog, state) => {
          await testing.sleep(6000);
        },
      });

      let events = new IterateEvents(i, [
        'started',
        'iteration-start',
        'iteration-failure',
        'iteration-complete',
        'stopped',
        'error',
      ]);

      i.on('started', () => {
        i.stop();
      });

      await new Promise(resolve => {
        i.on('error', resolve);
        i.start();
      });

      events.assert();
    }));

    test('should be correct with mixed results', testing.runWithFakeTime(async function() {
      let iterations = 0;

      let i = new subject({
        maxIterationTime: 3000,
        maxIterations: 6,
        maxFailures: 5,
        waitTime: 1000,
        handler: async (watchdog, state) => {
          if (iterations++ % 2 === 0) {
            throw new Error('even, so failing');
          } else {
            return 'odd, so working';
          }
        },
      });

      let events = new IterateEvents(i, [
        'started',
        'iteration-start',
        'iteration-failure',
        'iteration-complete',
        'iteration-start',
        'iteration-success',
        'iteration-complete',
        'iteration-start',
        'iteration-failure',
        'iteration-complete',
        'iteration-start',
        'iteration-success',
        'iteration-complete',
        'iteration-start',
        'iteration-failure',
        'iteration-complete',
        'iteration-start',
        'iteration-success',
        'iteration-complete',
        'completed',
        'stopped',
      ]);

      i.start();

      // stop and wait for the stop to take effect..
      await new Promise(resolve => {
        i.on('stopped', resolve);
      });

      events.assert();
    }));
  });
});
