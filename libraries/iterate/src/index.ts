import WatchDog from './watchdog.ts';
import debugFactory from 'debug';
import { EventEmitter } from 'node:events';
import { hrtime } from 'node:process';

const debug = debugFactory('iterate');

export type IterateHandler = (watchdog: WatchDog) => unknown;

/** Subset of @taskcluster/lib-monitor used by Iterate. */
export interface IterateMonitor {
  log: {
    periodic: (
      fields: { name: string; duration: number; status: 'exception' | 'success' },
      opts: { level: string }
    ) => void;
  };
  metric: {
    iterateDuration: (seconds: number, labels: { name: string; status: string }) => void;
  };
  reportError: (err: unknown, level?: string, extra?: Record<string, unknown>) => void;
}

export interface IterateOptions {
  name: string;
  handler: IterateHandler;
  monitor: IterateMonitor;
  maxIterationTime: number;
  waitTime: number;
  watchdogTime?: number;
  maxFailures?: number;
  maxIterations?: number;
  minIterationTime?: number;
}

/**
 * The Iterate Class.  See README.md for explanation of constructor
 * arguments and events that are emitted
 */
class Iterate extends EventEmitter {
  name: string;
  maxIterations: number;
  maxFailures: number;
  maxIterationTime: number;
  minIterationTime: number;
  watchdogTime: number;
  waitTime: number;
  handler: IterateHandler;
  monitor: IterateMonitor;
  keepGoing: boolean;
  onStopCall: (() => void) | null;
  stoppedPromise: Promise<void> | null;
  currentTimeout: ReturnType<typeof setTimeout> | null;

  constructor(opts: IterateOptions) {
    super();

    // Set default values
    const resolved = {
      watchdogTime: 0,
      maxFailures: 0,
      maxIterations: 0,
      minIterationTime: 0,
      ...opts,
    };

    if (!resolved.name) {
      throw new Error('Must provide a name to iterate');
    }
    this.name = resolved.name;

    if (typeof resolved.maxIterations !== 'number') {
      throw new Error('maxIterations must be number');
    }
    this.maxIterations = resolved.maxIterations;

    if (typeof resolved.maxFailures !== 'number') {
      throw new Error('maxFailures must be number');
    }
    this.maxFailures = resolved.maxFailures;

    if (typeof resolved.maxIterationTime !== 'number') {
      throw new Error('maxIterationTime must be number');
    }
    this.maxIterationTime = resolved.maxIterationTime;

    if (typeof resolved.minIterationTime !== 'number') {
      throw new Error('minIterationTime must be number');
    }
    this.minIterationTime = resolved.minIterationTime;

    if (typeof resolved.watchdogTime !== 'number') {
      throw new Error('watchdogTime must be number');
    }
    this.watchdogTime = resolved.watchdogTime;

    if (typeof resolved.waitTime !== 'number') {
      throw new Error('waitTime must be number');
    }
    this.waitTime = resolved.waitTime;

    if (typeof resolved.handler !== 'function') {
      throw new Error('handler must be a function');
    }
    this.handler = resolved.handler;

    if (!resolved.monitor || typeof resolved.monitor !== 'object') {
      throw new Error('monitor is required and must be an object from @taskcluster/lib-monitor');
    }
    this.monitor = resolved.monitor;

    // Decide whether iteration should continue
    this.keepGoing = false;

    // Called when stop is called (used to break out of waitTime sleep)
    this.onStopCall = null;

    // Fires when stopped, only set when started
    this.stoppedPromise = null;

    // Store the iteration timeout so that a `.stop()` call during an iteration
    // inhibits a handler from running
    this.currentTimeout = null;
  }

  async single_iteration() {
    debug('running handler');
    const start = new Date();
    const watchdog = new WatchDog(this.watchdogTime);
    let maxIterationTimeTimer: ReturnType<typeof setTimeout> | undefined;

    // build a promise that will reject when either the watchdog
    // times out or the maxIterationTimeTimer expires
    const timeoutRejector = new Promise<never>((_resolve, reject) => {
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
      await Promise.race([timeoutRejector, Promise.resolve(this.handler(watchdog))]);
    } finally {
      // stop the timers regardless of success or failure
      clearTimeout(maxIterationTimeTimer);
      watchdog.stop();
    }

    const duration = Date.now() - start.getTime();
    if (this.minIterationTime > 0 && duration < this.minIterationTime) {
      throw new Error('Handler duration was less than minIterationTime');
    }
  }

  // run a single iteration, throwing any errors
  async iterate() {
    let currentIteration = 0;
    let failures: unknown[] = [];

    this.emit('started');

    while (true) {
      currentIteration++;
      let iterError: unknown;

      this.emit('iteration-start');

      const start = hrtime.bigint();
      try {
        await this.single_iteration();
      } catch (err) {
        iterError = err;
      }
      const end = hrtime.bigint();
      const duration = Number(end - start) / 1e6; // in ms

      this.emit(iterError ? 'iteration-failure' : 'iteration-success');

      this.monitor.log.periodic(
        {
          name: this.name,
          duration,
          status: iterError ? 'exception' : 'success',
        },
        { level: iterError ? 'err' : 'notice' }
      );

      this.monitor.metric.iterateDuration(duration / 1000, {
        name: this.name,
        status: iterError ? 'exception' : 'success',
      });

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
        const stopPromise = new Promise<void>(resolve => {
          this.onStopCall = resolve;
        });
        let waitTimeTimeout: ReturnType<typeof setTimeout> | undefined;
        const waitTimePromise = new Promise<void>(resolve => {
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

    return new Promise<void>(resolve => {
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

export default Iterate;
