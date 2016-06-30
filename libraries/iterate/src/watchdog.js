let util = require('util');
let events = require('events');
let debug = require('debug')('watchdog');

/**
 * This is a watch dog timer.  Think of it as a ticking
 * timebomb which will throw an explosion when it hasn't
 * been stopped or touched in `maxTime` seconds.  The
 * `WatchDog` will throw an `Error` with `msg` if the
 * timer is allowed to expire
 */
class WatchDog extends events.EventEmitter {
  constructor(maxTime) {
    super();
    this.maxTime = maxTime;
    events.EventEmitter.call(this);
    this.action = () => {
      let error = new Error('Watchdog expired!');
      // A better way to make this mandatory?
      if (this.listeners('expired').length > 0) {
        debug('emitting expired event');
        this.emit('expired', error);
      } else {
        debug('exiting becase there is no expired event listener');
        process.exit(1); // eslint-disable-line no-process-exit
      }
    };
  }

  /**
   * Start the timers
   */
  start() {
    this.__watchDog = setTimeout(this.action, this.maxTime * 1000);
    this.emit('started');
    debug('started, emitted started event');
  }

  /**
   * Stop the timer
   */
  stop() {
    if (this.__watchDog) {
      debug('clearing timeout');
      clearTimeout(this.__watchDog);
    }
    this.emit('stopped');
    debug('stopped, emitted stopped event');
  }

  /**
   * Like the posix touch command, this function
   * resets the time on this watchdog, but the watchdog
   * keeps running
   */
  touch() {
    let oldWD = this.__watchDog;
    this.__watchDog = setTimeout(this.action, this.maxTime * 1000);
    clearTimeout(oldWD);
    this.emit('touched');
    debug('touched, reset timer');
  }
}
module.exports = WatchDog;
