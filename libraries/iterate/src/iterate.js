let WatchDog = require('./watchdog');
let debug = require('debug')('iterate');
let events = require('events');

/**
 * The Iterate Class.  See README.md for explanation of constructor
 * arguments and events that are emitted
 */
class Iterate extends events.EventEmitter {
  constructor(opts) {
    super();
    events.EventEmitter.call(this);

    // Set default values
    opts = Object.assign({}, {
      watchdogTime: 0,
      maxIterations: 0,
      maxFailures: 7,
      minIterationTime: 0,
    }, opts);

    if (typeof opts.maxIterations !== 'number') {
      throw new Error('maxIterations must be number');
    }
    this.maxIterations = opts.maxIterations;

    if (typeof opts.maxFailures !== 'number') {
      throw new Error('maxFailures must be number');
    }
    this.maxFailures = opts.maxFailures;

    if (typeof opts.maxIterationTime !== 'number') {
      throw new Error('maxIterationTime must be number');
    }
    this.maxIterationTime = opts.maxIterationTime;

    if (typeof opts.minIterationTime !== 'number') {
      throw new Error('minIterationTime must be number');
    }
    this.minIterationTime = opts.minIterationTime;

    if (typeof opts.watchdogTime !== 'number') {
      throw new Error('watchdogTime must be number');
    }
    this.watchdogTime = opts.watchdogTime;

    if (typeof opts.waitTime !== 'number') {
      throw new Error('waitTime must be number');
    }
    this.waitTime = opts.waitTime;

    if (typeof opts.handler !== 'function') {
      throw new Error('handler must be a function');
    }
    this.handler = opts.handler;

    if (opts.monitor && typeof opts.monitor !== 'object') {
      throw new Error('monitor should be an object from taskcluster-lib-monitor if given');
    }
    this.monitor = opts.monitor;

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

  // run a single iteration, throwing any errors
  async iterate() {
    this.emit('iteration-start');
    try {
      debug('running handler');
      let start = new Date();
      let watchdog = new WatchDog(this.watchdogTime);
      let maxIterationTimeTimer;

      // build a promise that will reject when either the watchdog
      // times out or the maxIterationTimeTimer expires
      let timeoutRejector = new Promise((resolve, reject) => {
        watchdog.on('expired', () => {
          reject(new Error('watchdog exceeded'));
        });

        maxIterationTimeTimer = setTimeout(() => {
          reject(new Error('Iteration exceeded maximum time allowed'));
        }, this.maxIterationTime);
      });

      try {
        watchdog.start();
        await Promise.race([
          timeoutRejector,
          Promise.resolve(this.handler(watchdog, this.sharedState)),
        ]);
      } finally {
        // stop the timers regardless of success or failure
        clearTimeout(maxIterationTimeTimer);
        watchdog.stop();
      }

      // TODO: do this timing the better way
      let diff = new Date() - start;

      // Let's check that if we have a minimum threshold for handler activity
      // time, and mark as failure when we exceed it
      if (this.minIterationTime > 0 && diff < this.minIterationTime) {
        throw new Error('Minimum threshold for handler execution not met');
      }

      // Wait until we've done all the checks to emit success
      this.emit('iteration-success');
      debug(`ran handler in ${diff} seconds`);
      if (this.monitor) {
        this.monitor.info('iteration', {
          status: 'success',
          duration: diff * 1000,
        });
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
        this.monitor.info('iteration', {
          status: 'failed',
        });
        this.monitor.reportError(err, 'warning', {
          consecutiveErrors: this.failures.length,
        });
      }
      debug('experienced iteration failure');
      this.failures.push(err);
    }
    this.emit('iteration-complete');

    // We don't wand this watchdog timer to always run

    // When we reach the end of a set number of iterations, we'll stop
    if (this.maxIterations > 0 && this.currentIteration >= this.maxIterations - 1) {
      debug(`reached max iterations of ${this.maxIterations}`);
      this.stop();
      this.emit('completed');
    }

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
