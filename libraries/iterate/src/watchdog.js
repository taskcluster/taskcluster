let events = require('events');

/**
 * This is a watch dog timer.  Think of it as a ticking timebomb which will
 * explode when it hasn't been stopped or touched in `maxTime` seconds.  The
 * "explosion" in this case is just an 'expired' event.
 */
class WatchDog extends events.EventEmitter {
  constructor(maxTime) {
    super();
    this.maxTime = maxTime;
    this.timer = null;
  }

  _set() {
    this._clear();
    if (this.maxTime) {
      this.timer = setTimeout(() => this.emit('expired'), this.maxTime);
    }
  }

  _clear() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * Start the timers
   */
  start() {
    this._set();
    this.emit('started');
  }

  /**
   * Stop the timer
   */
  stop() {
    this._clear();
    this.emit('stopped');
  }

  /**
   * Like the posix touch command, this function
   * resets the time on this watchdog, but the watchdog
   * keeps running
   */
  touch() {
    this._set();
    this.emit('touched');
  }
}
module.exports = WatchDog;
