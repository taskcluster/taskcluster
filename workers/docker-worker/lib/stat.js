import Debug from 'debug';
import co from 'co';
let debug = Debug('taskcluster-docker-worker:stat');

export default class Stat {
  constructor(statsd) {
    this.statsd = statsd;
  }

  increment(name) {
    this.statsd.increment(name);
  }

  time() {
    return this.statsd.timing.apply(this.statsd, arguments);
  }

  gauge() {
    return this.statsd.gauge.apply(this.statsd, arguments);
  }

  /**
  Timer helper it takes a generator (or any yiedable from co) and times
  the runtime of the action and issues timing metrics to statsd.

  @param {String} name statistic name.
  @param {Generator|Function|Promise} generator or yieldable.
  */
  async timeGen(name, fn) {
    var start = new Date();
    var result = await fn;
    this.statsd.timing(name, start);
    return result;
  }
}
