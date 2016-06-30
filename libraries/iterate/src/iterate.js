let _ = require('lodash');
let assert = require('assert');
let WatchDog = require('./watchdog');

class Iterate {
  constructor(opts) {
    assert(typeof opts.maxIterations === 'number', 'maxIterations must be number');
    this.maxIterations = opts.maxIterations;

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

    assert(typeof (opts.dmsConfig || {}) === 'object', 'dmsConfig must be object');
    this.dmsConfig = opts.dmsConfig || null;

    this.overallWatchDog = new WatchDog(this.maxIterationTime);
    this.incrementalWatchDog = new WatchDog(this.watchDogTime);

    // Count the iteration that we're on.
    this.currentIteration = 0;
    this.keepGoing = false;
  }

  start() {
    this.keepGoing = true;
    this.overallWatchDog.start();
    this.incrementalWatchDog.start();


  }

  stop() {
    this.overallWatchDog.start();
    this.incrementalWatchDog.start();
    this.keepGoing = false;
    this.currentIteration = 0;
  }

}
