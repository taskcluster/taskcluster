let _ = require('lodash');
let assert = require('assert');
let WatchDog = require('./watchdog');
let debug = require('debug')('iterate');
let request = require('request-promise');
let events = require('events');


/**
 * Run a handler many times.  Monitor the handler to make sure that it fails
 * loudly when it fails, but tries to succeed more than once before killing
 * itself.
 *
 * This library runs a handler, waits a defined period then runs the handler
 * again.  It emits relevant events.  The `error` event *must* be handled or
 * else a failure of the iteration will bring down the process
 *
 * A handler is a function which returns a promise (e.g. async function) that
 * will be executed.  This function will have the arguments `(watchdog, state)`
 * passed in.
 *
 * The watchdog instance should have its `watchdog.touch()` method called each
 * time the handler makes progress.  Think of a watchdog as a ticking timebomb
 * and the touch method as a way to reset the fuse.  We have one for the
 * overall iteration that you cannot touch inside the handler and one which you
 * can.  Say we're processing a list of things to submit to an api which
 * requires throttling.  We don't want to wait for a maxIterationInterval of,
 * say, 20 minutes before erroring if we freeze on the first of 100 requests
 * that take 1s each.
 *
 * The second parameter is an object that's passed into each invocation of the
 * handler.  It's important to remember that objects in JS are passed by
 * reference, but the reference itself is passed by value.  This means that you
 * *must* only set properties on the state parameter and not change the object
 * that the state parameter refers to.  In other words, never do `state = {}`
 * and always do `state.value = {}` instead.
 *
 * Options:
 *   * maxIterations (optional, default infinite): Complete up to this many 
 *     iterations and then successfully exit.  Failed iterations count.
 *   * maxFailures (optional, default 7): When this number of failures occur
 *     in consecutive iterations, treat as an error
 *   * maxIterationTime: the absolute upper bounds for an iteration interval.
 *     This time is exclusive of the time we wait between iterations.
 *   * minIterationTime (optional): If not at least this number of seconds
 *     have passed, treat the iteration as a failure
 *   * watchDog: this is the number of seconds to wait inside the iteration
 *     before marking as a failure.  This object has `.touch()` to mark when
 *     progress is made and should be reset and `.stop()` in case you really
 *     don't care about it
 *   * waitTime: number of seconds between the conclusion of one iteration
 *     and commencement of another.
 *   * waitTimeAfterFail (optional, default waitTime): If an iteration fails,
 *     wait a different amount of seconds before the next iteration
 *   * handler: promise returning function which contains work to execute.
 *     Is passed in a watchdog and state object reference
 *   * dmsConfig (optional): provide information of a deadman's snitch to
 *     inform of the completion of an iteration
 *
 * 
 * Emits:
 *   * 'started': when overall iteration starts
 *   * 'stopped': when overall iteration is finished
 *   * 'completed': only when we have a max number of iterations, when we
 *     finish the last iteration
 *   * 'iteration-start': when an individual iteration starts
 *   * 'iteration-success': when an individual iteration completes with
 *     success.  provides the value that handler resolves with
 *   * 'iteration-failure': provides iteration error
 *   * 'iteration-complete': when an iteration is complete regardless of outcome
 *   * 'error': when the iteration is considered to be concluded and provides
 *     list of iteration errors.  If there are no handlers and this event is
 *     emitted, an exception will be thrown in a process.nextTick callback.
 */
class Iterate extends events.EventEmitter {
  constructor(opts) {
    super();
    events.EventEmitter.call(this);

    assert(typeof (opts.maxIterations || 0) === 'number', 'maxIterations must be number');
    this.maxIterations = opts.maxIterations || 0;

    assert(typeof (opts.maxFailures || 7) === 'number', 'maxFailures must be number');
    this.maxFailures = opts.maxFailures || 7;

    assert(typeof opts.maxIterationTime === 'number', 'maxIterationTime must be number');
    this.maxIterationTime = opts.maxIterationTime * 1000;

    assert(typeof (opts.minIterationTime || 0) === 'number', 'minIterationTime must be number');
    this.minIterationTime = opts.minIterationTime * 1000 || 0;

    assert(typeof opts.watchDog === 'number', 'watchDog must be number');
    this.watchDogTime = opts.watchDog * 1000;

    assert(typeof opts.waitTime === 'number', 'waitTime must be number');
    this.waitTime = opts.waitTime * 1000;

    assert(typeof (opts.waitTimeAfterFail || 0) === 'number', 'waitTimeAfterFail must be number');
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

    // We add the times together since we're always going to have the watch dog
    // running even when we're waiting for the next iteration
    this.overallWatchDog = new WatchDog(this.maxIterationTime + this.waitTime);
    this.incrementalWatchDog = new WatchDog(this.watchDogTime);

    // We want to have a single way for all guarded failure cases to exit.
    // Instead of using the watch dog's process killing feature, we'll exit as
    // if this were any other error.  This is for both the overall and the
    // incremental watch dogs
    this.overallWatchDog.on('expired', () => {
      this.failures.push(new Error(`maxIterationTime of ${this.maxIterationTime} exceeded`));
      this.__emitFatalError();
    });
    this.incrementalWatchDog.on('expired', () => {
      this.failures.push(new Error(`watchDog of ${this.watchDogTime} exceeded`));
      this.__emitFatalError();
    });

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
    this.incrementalWatchDog.start();

    // Run the handler, pass in shared state so iterations can refer to
    // previous iterations without being too janky
    try {
      debug('running handler');
      let start = new Date();

      // Note that we're using a watch dog for the maxIterationTime guarding.
      // The overallWatchDog timer is the absolute upper bounds for this
      // iteration, this watchdog is the one to check things are still
      // happening in the handler.
      let value = await this.handler(this.incrementalWatchDog, this.sharedState);
      
      // TODO: do this timing the better way
      let diff = (new Date() - start) / 1000;
      this.emit('iteration-success', value);
      debug(`ran handler in ${diff} seconds`);

      // Let's check that if we have a minimum threshold for handler activity
      // time, and mark as failure when we exceed it
      if (this.minIterationTime > 0 && diff < this.minIterationTime) {
        throw new Error('Minimum threshold for handler execution not met');
      }

      // We could probably safely just create a new Array every time since if
      // we get to this point we want to reset the Array unconditionally, but I
      // don't have timing on the costs... premature optimization!
      if (this.failures.length > 0) {
        this.failures = [];
      }
    } catch (err) {
      this.emit('iteration-failure', err);
      debug('experienced iteration failure');
      this.failures.push(err);
    }
    this.emit('iteration-complete');

    // We don't wand this watchdog timer to always run
    this.incrementalWatchDog.stop();

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
    } else {
      if (this.keepGoing) {
        debug('scheduling next iteration');
        this.overallWatchDog.touch();
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
        this.__makeSafe();
      }
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
          }
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
    this.stop();
    this.__makeSafe();
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
    this.overallWatchDog.start();

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
    this.currentIteration = 0;
    debug('stopped');
  }

  __makeSafe() {
    this.overallWatchDog.stop();
    this.incrementalWatchDog.stop();
    this.emit('stopped');
  }

}

module.exports = Iterate;
