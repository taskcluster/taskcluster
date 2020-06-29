const subject = require('../');
const assume = require('assume');
const debug = require('debug')('iterate-test');
const {MonitorManager} = require('taskcluster-lib-monitor');
const testing = require('taskcluster-lib-testing');

const possibleEvents = [
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
    const dl = () => { // dl === dump list
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
  let monitor;

  suiteSetup(async () => {
    monitor = MonitorManager.setup({
      serviceName: 'lib-iterate',
      fake: true,
      debug: true,
      verify: true,
    });
  });

  suiteTeardown(() => {
    monitor.manager.reset();
  });

  const runWithFakeTime = fn => {
    return testing.runWithFakeTime(fn, {
      systemTime: 0,
    });
  };

  test('should be able to start and stop', runWithFakeTime(async function() {
    let iterations = 0;

    const i = new subject({
      name: 'foo',
      monitor,
      maxIterationTime: 3000,
      waitTime: 1000,
      watchDog: 0,
      handler: async watchdog => {
        debug('iterate!');
        iterations++;
        return 1;
      },
    });

    let err = null;
    i.on('error', e => { err = e; });
    i.on('stopped', () => { err = new Error('unexpected stopped event'); });

    i.start();

    await testing.sleep(5000);

    assume(err).to.equal(null);
    assume(iterations).equals(5);
    assume(i.keepGoing).is.ok();
    await i.stop();
    assume(i.keepGoing).is.not.ok();
    assume(monitor.manager.messages.length).equals(5);
    monitor.manager.messages.forEach(message => {
      assume(message.Fields.status).equals('success');
    });
  }));

  test('should stop after current iteration completes', runWithFakeTime(async function() {
    const i = new subject({
      name: 'foo',
      monitor,
      maxIterationTime: 3000,
      waitTime: 10,
      maxIterations: 5,
      watchDog: 0,
      handler: async watchdog => {
        await testing.sleep(500);
      },
    });

    i.start();
    await i.stop();

    assume(monitor.manager.messages.length).atleast(5);
    assume(monitor.manager.messages[0].Type).equals('monitor.periodic');

    assume(+new Date()).atleast(500);
  }));

  test('should stop in the midst of waitTime', runWithFakeTime(async function() {
    const i = new subject({
      name: 'foo',
      monitor,
      maxIterationTime: 3000,
      waitTime: 1000,
      maxIterations: 2,
      watchDog: 0,
      handler: async watchdog => {
        await testing.sleep(500);
      },
    });

    i.start();
    await testing.sleep(1000);
    await i.stop();

    assume(+new Date()).between(1000, 1100);
  }));

  test('should stop after correct number of iterations', runWithFakeTime(async function() {
    let iterations = 0;

    const i = new subject({
      name: 'foo',
      monitor,
      maxIterationTime: 3000,
      waitTime: 10,
      maxIterations: 5,
      watchDog: 0,
      handler: async watchdog => {
        debug('iterate!');
        iterations++;
        return 1;
      },
    });

    i.start();

    await new Promise(resolve => {
      i.on('stopped', resolve);
    });

    assume(iterations).equals(5);
    assume(i.keepGoing).is.not.ok();
  }));

  test('should emit error when iteration watchdog expires', runWithFakeTime(async function() {
    const i = new subject({
      name: 'foo',
      monitor,
      maxIterationTime: 5000,
      watchdogTime: 1000,
      waitTime: 1000,
      maxFailures: 1,
      handler: async watchdog => {
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

  test('should emit error when overall iteration limit is hit', runWithFakeTime(async function() {
    const i = new subject({
      name: 'foo',
      monitor,
      maxIterationTime: 1000,
      waitTime: 1000,
      maxFailures: 1,
      handler: async watchdog => {
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

  test('should emit iteration-failure when async handler fails', runWithFakeTime(async function() {
    const i = new subject({
      name: 'foo',
      monitor,
      maxIterationTime: 1000,
      waitTime: 1000,
      maxFailures: 100,
      handler: async watchdog => {
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

  test('should emit iteration-failure when sync handler fails', runWithFakeTime(async function() {
    const i = new subject({
      name: 'foo',
      monitor,
      maxIterationTime: 1000,
      waitTime: 1000,
      maxFailures: 100,
      handler: watchdog => {
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

  test('should emit iteration-failure when iteration is too quick', runWithFakeTime(async function() {
    const i = new subject({
      name: 'foo',
      monitor,
      maxIterationTime: 12000,
      minIterationTime: 10000,
      waitTime: 1000,
      watchDog: 0,
      handler: async watchdog => {
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

  test('should emit error after too many failures', runWithFakeTime(async function() {
    const i = new subject({
      name: 'foo',
      monitor,
      maxIterationTime: 12000,
      maxFailures: 1,
      waitTime: 1000,
      handler: async watchdog => {
        throw new Error('uhoh');
      },
    });

    let err = null;
    i.on('error', e => { err = e; });

    i.start();
    await testing.sleep(1500);
    i.stop();

    assume(i.keepGoing).is.not.ok();
    assume(err).matches(/uhoh/);
  }));

  test('should emit correct events for single iteration', runWithFakeTime(async function() {
    const i = new subject({
      name: 'foo',
      monitor,
      maxIterationTime: 3000,
      waitTime: 1000,
      handler: async watchdog => {
        debug('iterate!');
      },
    });

    const events = new IterateEvents(i, [
      'started',
      'iteration-start',
      'iteration-success',
      'iteration-complete',
      'stopped',
    ]);

    i.start();
    await i.stop();

    events.assert();
  }));

  test('should emit correct events with maxIterations', runWithFakeTime(async function() {
    const i = new subject({
      name: 'foo',
      monitor,
      maxIterationTime: 3000,
      maxIterations: 1,
      waitTime: 1000,
      handler: async watchdog => {
        debug('iterate!');
      },
    });

    const events = new IterateEvents(i, [
      'started',
      'iteration-start',
      'iteration-success',
      'iteration-complete',
      'stopped',
    ]);

    i.start();
    await testing.sleep(2000);
    await i.stop();

    events.assert();
  }));

  suite('event emission ordering', () => {

    test('should be correct with maxFailures and maxIterations', runWithFakeTime(async function() {
      const i = new subject({
        name: 'foo',
        monitor,
        maxIterationTime: 3000,
        maxIterations: 1,
        maxFailures: 1,
        waitTime: 1000,
        handler: async watchdog => {
          debug('iterate!');
          throw new Error('hi');
        },
      });

      const events = new IterateEvents(i, [
        'started',
        'iteration-start',
        'iteration-failure',
        'iteration-complete',
        'error',
        'stopped',
      ]);

      i.start();
      await i.stop();

      events.assert();
    }));

    test('should be correct with maxFailures only', runWithFakeTime(async function() {
      const i = new subject({
        name: 'foo',
        monitor,
        maxIterationTime: 3000,
        maxFailures: 1,
        waitTime: 1000,
        handler: async watchdog => {
          debug('iterate!');
          throw new Error('hi');
        },
      });

      const events = new IterateEvents(i, [
        'started',
        'iteration-start',
        'iteration-failure',
        'iteration-complete',
        'error',
        'stopped',
      ]);

      i.start();
      await i.stop();

      events.assert();
    }));

    test('should be correct when handler takes too little time', runWithFakeTime(async function() {
      const i = new subject({
        name: 'foo',
        monitor,
        maxIterationTime: 3000,
        minIterationTime: 100000,
        maxFailures: 1,
        waitTime: 1000,
        handler: async watchdog => {
          return true;
        },
      });

      const events = new IterateEvents(i, [
        'started',
        'iteration-start',
        'iteration-failure',
        'iteration-complete',
        'error',
        'stopped',
      ]);

      i.start();
      await i.stop();

      events.assert();
    }));

    test('should be correct when handler takes too long (incremental watchdog)', runWithFakeTime(async function() {
      const i = new subject({
        name: 'foo',
        monitor,
        maxIterationTime: 5000,
        maxFailures: 1,
        watchdogTime: 100,
        waitTime: 1000,
        handler: async watchdog => {
          await testing.sleep(3000);
        },
      });

      const events = new IterateEvents(i, [
        'started',
        'iteration-start',
        'iteration-failure',
        'iteration-complete',
        'error',
        'stopped',
      ]);

      i.start();
      await i.stop();

      events.assert();
    }));

    test('should be correct when handler takes too long (overall time)', runWithFakeTime(async function() {
      const i = new subject({
        name: 'foo',
        monitor,
        maxIterationTime: 3000,
        maxFailures: 1,
        waitTime: 1000,
        handler: async watchdog => {
          await testing.sleep(6000);
        },
      });

      const events = new IterateEvents(i, [
        'started',
        'iteration-start',
        'iteration-failure',
        'iteration-complete',
        'error',
        'stopped',
      ]);

      i.start();
      await i.stop();

      events.assert();
    }));

    test('should be correct with mixed results', runWithFakeTime(async function() {
      let iterations = 0;

      const i = new subject({
        name: 'foo',
        monitor,
        maxIterationTime: 3000,
        maxIterations: 6,
        maxFailures: 5,
        waitTime: 1000,
        handler: async watchdog=> {
          if (iterations++ % 2 === 0) {
            throw new Error('even, so failing');
          } else {
            return 'odd, so working';
          }
        },
      });

      const events = new IterateEvents(i, [
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
        'stopped',
      ]);

      i.start();

      // wait for the maxIterations to take effect..
      await new Promise(resolve => {
        i.on('stopped', resolve);
      });

      events.assert();
    }));
  });
});
