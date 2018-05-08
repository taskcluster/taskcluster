const {pickBy} = require('lodash');

/**
 * Rate limit things, such as destination addresses.
 *
 * Rate limits are expressed as count/time, and the class will limit events
 * to a maximum of that ratio, using a sliding window <time> seconds wide
 * and containing at most <count> events.
 *
 * To keep memory consumption down, this periodically purges its state tracking.
 * Call `stop()` to stop this periodic job.  To prevent that from starting, pass
 * noPeriodicPurge: true to the constructor.
 */
class RateLimit {
  constructor({count, time, noPeriodicPurge}) {
    this.count = count;
    this.time = time;

    this.times = {};

    if (!noPeriodicPurge) {
      this.periodicPurge = setInterval(() => this.purgeAllOldTimes(), time);
    }
  }

  /**
   * Stop periodic purging
   */
  stop() {
    if (this.periodicPurge) {
      cancelInterval(this.periodicPurge);
      this.periodicPurge = null;
    }
  }

  _get(key) {
    if (!(key in this.times)) {
      this.times[key] = [];
    }
    return this.times[key];
  }

  /**
   * Return the remaining allowed instances of events with this key.
   */
  remaining(key) {
    const times = this._get(key);

    this.purgeOldTimes(times);
    return this.count - times.length;
  }

  /**
   * Mark an event as having occurred.
   */
  markEvent(key) {
    const times = this._get(key);
    times.push(new Date());
  }

  /**
   * Purge all times that are out of the sliding window, and delete any tracking for
   * keys with no events in the window.
   */
  purgeAllOldTimes() {
    this.times = pickBy(this.times, (times, key) => {
      this.purgeOldTimes(times);
      return times.length > 0;
    });
  }

  /**
   * Purge times for the given array of Date instance that are out of the sliding
   * window.
   */
  purgeOldTimes(times) {
    const startTime = new Date();
    startTime.setSeconds(startTime.getSeconds() - this.time);

    while (times.length && times[0] < startTime) {
      times.shift();
    }
  }
}

module.exports = RateLimit;
