function Stat(statsd) {
  this.statsd = statsd;
}

Stat.prototype = {

  increment: function(name) {
    this.statsd.increment(name);
  },

  time: function() {
    return this.statsd.timing.apply(this.statsd, arguments);
  },

  gauge: function() {
    return this.statsd.gauge.apply(this.statsd, arguments);
  },

  /**
  Timer helper it takes a generator (or any yiedable from co) and times
  the runtime of the action and issues timing metrics to statsd.

  @param {String} name statistic name.
  @param {Generator|Function|Promise} generator or yieldable.
  */
  timeGen: function* (name, generator) {
    var start = new Date();
    var result = yield generator;
    this.statsd.timing(name, start);
    return result;
  }

};

module.exports = Stat;
