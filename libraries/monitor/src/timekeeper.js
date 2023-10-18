import { hrtime } from 'process';

/**
 * A TimeKeeper is used for measuring arbitrary times.  This is nice when the
 * action to time does not fit neatly into a single function or promise.  A
 * TimeKeeper should be created for each measurement and should only have its
 * measurement submitted a single time.  An exception will be thrown if you try
 * to submit the same doo dad twice.
 */
class TimeKeeper {

  /**
   * Create a Timer and set the start time for the measurement.
   */
  constructor(monitor, name) {
    this.monitor = monitor;
    this.name = name;
    this.start = hrtime.bigint();
    this.submitted = false;
  }

  /**
   * Compare the start and end times then submit the value to the monitor for
   * records.
   */
  measure(force = false, extra = {}) {
    if (!force && this.submitted) {
      throw new Error('Cannot submit measurement twice for ' + this.monitor.prefix + ' ' + this.name);
    }
    this.submitted = true;
    const end = hrtime.bigint();
    this.monitor.log.timekeeper(Object.assign({
      key: this.name,
      duration: Number(end - this.start) / 1e6, // in ms
    }, extra));
  }
}

export default TimeKeeper;
