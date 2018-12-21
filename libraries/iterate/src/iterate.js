let _ = require('lodash');
let assert = require('assert');
let WatchDog = require('./watchdog');
let debug = require('debug')('iterate');
let request = require('request-promise');
let events = require('events');

class CommandPromise {

  constructor() {
    this.called = false;
    this.p = new Promise((res, rej) => {
      this.__res = res;
      this.__rej = rej;
    });
  }

  __throw() {
    throw new Error('Already resolved or rejected');
  }

  reject(x) {
    if (this.called) {
      this.__throw();
    }
    this.__rej(x);
  }

  resolve(x) {
    if (this.called) {
      this.__throw();
    }
    this.__res(x);
  }

  promise() {
    return this.p;
  }

}

/**
 * The Iterate Class.  See README.md for explanation of constructor
 * arguments and events that are emitted
 */
class Iterate extends events.EventEmitter {
  constructor(opts) {
    super();
    events.EventEmitter.call(this);

    // Set default values
    opts = _.defaults({}, opts, {
      maxIterations: 0,
      maxFailures: 7,
      minIterationTime: 0,
      waitTimeAfterFail: 0,
    });

    assert(typeof opts.maxIterations === 'number', 'maxIterations must be number');
    this.maxIterations = opts.maxIterations;

    assert(typeof opts.maxFailures === 'number', 'maxFailures must be number');
    this.maxFailures = opts.maxFailures;

    assert(typeof opts.maxIterationTime === 'number', 'maxIterationTime must be number');
    this.maxIterationTime = opts.maxIterationTime * 1000;

    assert(typeof opts.minIterationTime === 'number', 'minIterationTime must be number');
    this.minIterationTime = opts.minIterationTime * 1000;

    assert(typeof opts.watchDog === 'number', 'watchDog must be number');
    this.watchDogTime = opts.watchDog * 1000;

    assert(typeof opts.waitTime === 'number', 'waitTime must be number');
    this.waitTime = opts.waitTime * 1000;

    assert(typeof opts.waitTimeAfterFail === 'number', 'waitTimeAfterFail must be number');
    this.waitTimeAfterFail = opts.waitTimeAfterFail || opts.waitTime;

    // Not sure if the deep
    assert(typeof opts.handler === 'function', 'handler must be a function');
    this.handler = opts.handler;

    assert(typeof (opts.dmsConfig || {}) === 'object', 'dmsConfig must be object');
    this.dmsConfig = opts.dmsConfig || null;
    if (this.dmsConfig) {
      assert(typeof this.dmsConfig === 'object', 'dms config must be object');
      assert(typeof this.dmsConfig.snitchUrl === 'string',
        'dms config must have snitchUrl as string');
      assert(typeof this.dmsConfig.apiKey === 'string',
        'dms config must have apiKey as string');
    }

    assert(!opts.monitor || typeof opts.monitor === 'object',
      'monitor should be an object from taskcluster-lib-monitor if given');
    this.monitor = opts.monitor;

    // We add the times together since we're always going to have the watch dog
    // running even when we're waiting for the next iteration
    this.watchDog = new WatchDog(this.watchDogTime);

    // Count the iteration that we're on.
    this.currentIteration = 0;

    // Decide whether iteration should continue
    this.keepGoing = false;

    // Store the list of exceptions of the last few iterations
    this.failures = [];

    // We want to be able to share state between iterations
    this.sharedState = {};

    // Store the iteration timeout so that a `.stop()` call during an iteration
    // inhibits a handler from running
    this.currentTimeout = null;
  }

  async iterate() {
    // We only run this watch dog for the actual iteration loop
    this.emit('iteration-start');

    // Run the handler, pass in shared state so iterations can refer to
    // previous iterations without being too janky
    try {
      debug('running handler');
      let start = new Date();

      let watchDog = new WatchDog(this.watchDogTime);

      let watchDogRejector = new CommandPromise();

      watchDog.on('expired', () => {
        watchDogRejector.reject(new Error('watchDog exceeded'));
      });

      watchDog.start();
      // Note that we're using a watch dog for the maxIterationTime guarding.
      let maxIterationTimeTimer, value;
      try {
        value = await Promise.race([
          new Promise((res, rej) => {
            maxIterationTimeTimer = setTimeout(() => {
              debug(`handler lost race to timeout ${this.maxIterationTime}ms`);
              rej(new Error('Iteration exceeded maximum time allowed'));
            }, this.maxIterationTime);
          }),
          watchDogRejector.promise(),
          this.handler(watchDog, this.sharedState),
        ]);
      } finally {
        clearTimeout(maxIterationTimeTimer);
        watchDog.stop();
      }

      // TODO: do this timing the better way
      let diff = (new Date() - start) / 1000;

      // Let's check that if we have a minimum threshold for handler activity
      // time, and mark as failure when we exceed it
      if (this.minIterationTime > 0 && diff < this.minIterationTime) {
        throw new Error('Minimum threshold for handler execution not met');
      }

      // Wait until we've done all the checks to emit success
      this.emit('iteration-success', value);
      debug(`ran handler in ${diff} seconds`);
      if (this.monitor) {
        this.monitor.measure('iteration-time', diff * 1000);
        this.monitor.count('successful-iteration', 1);
      }

      // We could probably safely just create a new Array every time since if
      // we get to this point we want to reset the Array unconditionally, but I
      // don't have timing on the costs... premature optimization!
      if (this.failures.length > 0) {
        this.failures = [];
      }
    } catch (err) {
      this.emit('iteration-failure', err);
      if (this.monitor) {
        this.monitor.count('failed-iteration', 1);
        this.monitor.reportError(err, 'warning', {
          consecutiveErrors: this.failures.length,
        });
      }
      debug('experienced iteration failure');
      this.failures.push(err);
    }
    this.emit('iteration-complete');

    // We don't wand this watchdog timer to always run

    // TODO: double check this isn't an off by one
    // When we reach the end of a set number of iterations, we'll stop
    if (this.maxIterations > 0 && this.currentIteration >= this.maxIterations - 1) {
      debug(`reached max iterations of ${this.maxIterations}`);
      this.stop();
      this.emit('completed');
    }

    // Hit the dead man's snitch
    await this.__hitDMS();

    if (this.failures.length >= this.maxFailures) {
      this.__emitFatalError();
    } else if (this.keepGoing) {
      debug('scheduling next iteration');
      this.currentIteration++;
      this.currentTimeout = setTimeout(async () => {
        try {
          await this.iterate();
        } catch (err) {
          console.error(err.stack || err);
        }
      }, this.waitTime);
    } else {
      this.stop();
      this.emit('stopped');
    }
  }

  async __hitDMS() {
    // Hit the dead man's snitch
    // TODO: Do something so that we can call this function repeatedly but we
    // only actually hit the API if the last call to the function was more than
    // 5 minutes ago
    if (this.dmsConfig) {
      try {
        debug('hitting deadman\'s snitch');
        let result = await request.get(this.dmsConfig.snitchUrl, {
          auth: {
            username: this.dmsConfig.apiKey,
            password: '',
            sendImmediately: true,
          },
        });
        debug('hit deadman\'s snitch');
      } catch (err) {
        debug(`error hitting deadman's snitch ${err.stack || err}`);
      }
    }
  }

  /**
   * Special function which knows how to emit the final error and then throw an
   * unhandled exception where appropriate.  Also stop trying to iterate
   * further.
   */
  __emitFatalError() {
    if (this.currentTimeout) {
      clearTimeout(this.currentTimeout);
    }
    this.stop();
    this.emit('stopped');
    if (this.monitor) {
      let err = new Error('Fatal iteration error');
      err.failures = this.failures;
      this.monitor.reportError(err);
    }
    if (this.listeners('error').length > 0) {
      this.emit('error', this.failures);
    } else {
      debug('fatal error:');
      for (let x of this.failures) {
        debug(`  * ${x.stack || x}`);
      }
      debug('trying to crash process');
      process.nextTick(() => {
        throw new Error(`Errors:\n=====\n${this.failures.map(x => x.stack || x).join('=====\n')}`);
      });
    }
  }

  start() {
    debug('starting');
    this.keepGoing = true;

    // Two reasons we call it this way:
    //   1. first call should have same exec env as following
    //   2. start should return immediately
    this.currentTimeout = setTimeout(async () => {
      debug('starting iteration');
      this.emit('started');
      try {
        await this.iterate();
      } catch (err) {
        console.error(err.stack || err);
      }
    }, 0);
  }

  stop() {
    this.keepGoing = false;
    debug('stopped');
  }

}

module.exports = Iterate;
