const WatchDog = require('./watchdog');
const debug = require('debug')('iterate');
const events = require('events');

/**
 * The Iterate Class.  See README.mdx for explanation of constructor
 * arguments and events that are emitted
 */
class Iterate extends events.EventEmitter {
  constructor(opts) {
    super();
    events.EventEmitter.call(this);

    // Set default values
    opts = Object.assign({}, {
      watchdogTime: 0,
      maxFailures: 0,
      maxIterations: 0,
      minIterationTime: 0,
    }, opts);

    if (!opts.name) {
      throw new Error('Must provide a name to iterate');
    }
    this.name = opts.name;

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

    if (!opts.monitor || typeof opts.monitor !== 'object') {
      throw new Error('monitor is required and must be an object from taskcluster-lib-monitor');
    }
    this.monitor = opts.monitor;

    // Decide whether iteration should continue
    this.keepGoing = false;

    // Called when stop is called (used to break out of waitTime sleep)
    this.onStopCall = null;

    // Fires when stopped, only set when started
    this.stopPromise = null;

    // Store the iteration timeout so that a `.stop()` call during an iteration
    // inhibits a handler from running
    this.currentTimeout = null;
  }

  async single_iteration() {
    debug('running handler');
    const start = new Date();
    const watchdog = new WatchDog(this.watchdogTime);
    let maxIterationTimeTimer;

    // build a promise that will reject when either the watchdog
    // times out or the maxIterationTimeTimer expires
    const timeoutRejector = new Promise((resolve, reject) => {
      watchdog.on('expired', () => {
        debug('watchdog expired');
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
        Promise.resolve(this.handler(watchdog)),
      ]);
    } finally {
      // stop the timers regardless of success or failure
      clearTimeout(maxIterationTimeTimer);
      watchdog.stop();
    }

    const duration = new Date() - start;
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

      this.monitor.log.periodic({
        name: this.name,
        duration,
        status: iterError ? 'exception': 'success',
      }, {level: iterError ? 'err' : 'notice'});

      if (iterError) {
        this.monitor.reportError(iterError, 'warning', {
          consecutiveErrors: failures.length,
        });
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

      if (this.maxFailures > 0 && failures.length >= this.maxFailures) {
        this.emit('error', failures[failures.length - 1]);
      }

      if (!this.keepGoing) {
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

  start() {
    debug('starting');
    this.stoppedPromise = new Promise(resolve => {
      this.on('stopped', resolve);
    });
    this.keepGoing = true;

    return new Promise(resolve => {
      this.once('started', resolve);
      // start iteration; any failures here are a programming error in this
      // library and so should be considered fatal
      this.iterate().catch(err => this.emit('error', err));
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
