let _ = require('lodash');
let assert = require('assert');
let WatchDog = require('./watchdog');
let debug = require('debug')('iterate');
let request = require('request-promise');

class Iterate {
  constructor(opts) {
    assert(typeof (opts.maxIterations || 0) === 'number', 'maxIterations must be number');
    this.maxIterations = opts.maxIterations || 0;

    assert(typeof (opts.maxFailures || 7) === 'number', 'maxFailures must be number');
    this.maxFailures = opts.maxFailures || 7;

    assert(typeof opts.maxIterationTime === 'number', 'maxIterationTime must be number');
    this.maxIterationTime = opts.maxIterationTime;

    assert(typeof (opts.minIterationTime || 0) === 'number', 'minIterationTime must be number');
    this.minIterationTime = opts.minIterationTime || 0;

    assert(typeof opts.watchDog === 'number', 'watchDog must be number');
    this.watchDogTime = opts.watchDog;

    assert(typeof opts.waitTime === 'number', 'waitTime must be number');
    this.waitTime = opts.waitTime;

    assert(typeof (opts.waitTimeAfterFail || 0) === 'number', 'waitTimeAfterFail must be number');
    this.waitTimeAfterFail = opts.waitTimeAfterFail || opts.waitTime;

    // Not sure if the deep
    assert(typeof opts.handler === 'function', 'handler must be a function');
    this.handler = opts.handler;

    assert(typeof (opts.dmsConfig || {}) === 'object', 'dmsConfig must be object');
    this.dmsConfig = opts.dmsConfig || null;
    if (this.dmsConfig) {
      assert(typeof this.dmsConfig === 'object');
      assert(typeof this.dmsConfig.snitchUrl === 'string');
      assert(typeof this.dmsConfig.apiKey === 'string');
    }

    // We add the times together since we're always going to have the watch dog
    // running even when we're waiting for the next iteration
    this.overallWatchDog = new WatchDog(this.maxIterationTime + this.waitTime);
    this.incrementalWatchDog = new WatchDog(this.watchDogTime);

    // Count the iteration that we're on.
    this.currentIteration = 0;
    this.keepGoing = false;

    // Store the list of exceptions of the last few iterations
    this.failures = [];

    // We want to be able to share state between iterations
    this.sharedState = {};
  }

  async iterate() {
    // We only run this watch dog for the actual iteration loop
    this.incrementalWatchDog.start();

    // Run the handler, pass in shared state so iterations can refer to
    // previous iterations without being too janky
    try {
      debug('running handler');
      await this.handler(this.incrementalWatchDog, this.sharedState);
      debug('ran handler');
      // Premature optimization?
      if (this.failures.length > 0) {
        this.failures = [];
      }
    } catch (err) {
      debug('experienced iteration failure');
      this.failures.push(err);
    }

    // We don't wand this watchdog timer to always run
    this.incrementalWatchDog.stop();

    if (this.failures.length > this.maxFailures) {
      debug('exiting because of too many failures');
      process.nextTick(() => {
        // Aggregate the stacks and throw with all of them
        let exceptions = this.failures.map(x => x.stack || x).join('======\n');
        throw new Error(`Exceptions:\n=====\n${exceptions}\n=====`);
      });
    }

    // TODO: double check this isn't an off by one
    // When we reach the end of a set number of iterations, we'll stop
    if (this.maxIterations > 0 && this.maxIterations <= this.currentIteration + 1) {
      debug(`reached max iterations of ${this.maxIterations}`);
      this.stop();
    }

    // Hit the dead man's snitch
    if (this.dmsConfig) {
      try {
        debug('hitting deadman\'s snitch');
        let result = await request.get(this.dmsConfig.snitchUrl, {
          auth: {
            username: this.dmsConfig.apiKey,
            password: '',
            sendImmediately: true,
          }
        });
        debug('hit deadman\'s snitch');
      } catch (err) {
        debug(`error hitting deadman's snitch ${err.stack || err}`);
      }
    }

    if (this.keepGoing) {
      debug('scheduling next iteration');
      this.currentIteration++;
      setTimeout(async () => {
        await this.iterate();
      }, this.waitTime);
    }
  }

  start() {
    debug('starting');
    this.keepGoing = true;
    this.overallWatchDog.start();

    // Two reasons we call it this way:
    //   1. first call should have same exec env as following
    //   2. start should return immediately
    setTimeout(async () => {
      await this.iterate();
    }, 0);
  }

  stop() {
    this.overallWatchDog.stop();
    this.keepGoing = false;
    this.currentIteration = 0;
    debug('stopped');
  }

}

module.exports = Iterate;
