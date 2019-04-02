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
      maxFailures: 7,
      maxIterations: 0,
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

    // Decide whether iteration should continue
    this.keepGoing = false;

    // Called when stop is called (used to break out of waitTime sleep)
    this.onStopCall = null;

    // Fires when stopped, only set when started
    this.stopPromise = null;

    // We want to be able to share state between iterations
    this.sharedState = {};

    // Store the iteration timeout so that a `.stop()` call during an iteration
    // inhibits a handler from running
    this.currentTimeout = null;
  }

  async single_iteration() {
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

    let duration = new Date() - start;
    if (this.minIterationTime > 0 && duration < this.minIterationTime) {
      throw new Error('Handler duration was less than minIterationTime');
    }
  }

  // run a single iteration, throwing any errors
  async iterate() {
    let currentIteration = 0;
    let failures = [];

    this.emit('started');

    while (true) {
      currentIteration++;
      let iterError;

      this.emit('iteration-start');

      const start = process.hrtime();
      try {
        await this.single_iteration();
      } catch (err) {
        iterError = err;
      }
      const d = process.hrtime(start);
      const duration = d[0] * 1000 + d[1] / 1000000;

      this.emit(iterError ? 'iteration-failure' : 'iteration-success');
      if (this.monitor) {
        this.monitor.info('iteration', {
          status: iterError ? 'failed' : 'success',
          duration,
        });
      }

      if (iterError) {
        if (this.monitor) {
          this.monitor.reportError(iterError, 'warning', {
            consecutiveErrors: failures.length,
          });
        }
        failures.push(iterError);
      } else {
        failures = [];
      }

      this.emit('iteration-complete');

      // When we reach the end of a set number of iterations, we'll stop
      if (this.maxIterations > 0 && currentIteration >= this.maxIterations) {
        debug(`reached max iterations of ${this.maxIterations}`);
        this.keepGoing = false;
      }

      if (failures.length >= this.maxFailures) {
        this.__emitFatalError(failures);
        break;
      } else if (!this.keepGoing) {
        break;
      }

      if (this.waitTime > 0) {
        debug('waiting for next iteration or stop');
        const stopPromise = new Promise(resolve => {
          this.onStopCall = resolve;
        });
        let waitTimeTimeout;
        const waitTimePromise = new Promise(resolve => {
          waitTimeTimeout = setTimeout(resolve, this.waitTime);
        });
        await Promise.race([stopPromise, waitTimePromise]);

        this.onStopCall = null;
        clearTimeout(waitTimeTimeout);

        if (!this.keepGoing) {
          break;
        }
      }
    }
    this.emit('stopped');
  }

  /**
   * Special function which knows how to emit the final error and then throw an
   * unhandled exception where appropriate.  Also stop trying to iterate
   * further.
   */
  __emitFatalError(failures) {
    if (this.monitor) {
      let err = new Error('Fatal iteration error');
      err.failures = failures;
      this.monitor.reportError(err);
    }
    if (this.listeners('error').length > 0) {
      this.emit('error', failures);
    } else {
      debug('fatal error:');
      for (let x of failures) {
        debug(`  * ${x.stack || x}`);
      }
      debug('trying to crash process');
      process.nextTick(() => {
        throw new Error(`Errors:\n=====\n${failures.map(x => x.stack || x).join('=====\n')}`);
      });
    }
  }

  start() {
    debug('starting');
    this.stoppedPromise = new Promise(resolve => {
      this.on('stopped', resolve);
    });
    this.keepGoing = true;

    return new Promise(resolve => {
      this.once('started', resolve);
      process.nextTick(() => this.iterate());
    });
  }

  stop() {
    this.keepGoing = false;
    if (this.onStopCall) {
      this.onStopCall();
    }
    return this.stoppedPromise;
  }
}

module.exports = Iterate;
