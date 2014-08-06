var spawn = require('child_process').spawn;
var co = require('co');
var coEvent = require('co-event');
var debug = require('debug')('docker-worker:shutdown_manager');

function ShutdownManager(host, config) {
  this.host = host;
  this.config = config;

  this.onIdle = this.onIdle.bind(this);
  this.onWorking = this.onWorking.bind(this);
}

ShutdownManager.prototype = {
  idleTimeout: null,

  shutdown: co(function* () {
    this.config.log('shutdown');
    spawn('shutdown', ['-h', 'now']);
  }),

  /**
  Calculate when we should shutdown this worker.
  */
  nextShutdownTime: function* () {
    var shutdownStartRange = this.config.shutdownSecondsStart;
    var shutdownStopRange = this.config.shutdownSecondsStop;

    var stats = yield {
      uptime: this.host.billingCycleUptime(),
      interval: this.host.billingCycleInterval()
    };

    this.config.log('uptime', stats);

    // Remaining time in the billing cycle
    var remainder = stats.interval - (stats.uptime % stats.interval);

    // We are so close to the end of this billing cycle we go another before
    // trigger a shutdown.
    if (remainder <= shutdownStopRange) {
      // Trigger it when only shutdownStopRange remains on the _next_ billing
      // cycle.
      return remainder + (stats.interval - shutdownStartRange);
    }

    // Remainder of this billing cycle falls within the range where we can
    // immediately shutdown.
    if (remainder <= shutdownStartRange) {
      return 0;
    }

    // We are somewhere in our billing cycle before shutdownStartRange.
    return remainder - shutdownStartRange;
  },

  onIdle: co(function* () {
    var shutdownTime = yield this.nextShutdownTime();
    this.config.log('pending shutdown', {
      time: shutdownTime
    });

    this.idleTimeout =
      setTimeout(this.shutdown.bind(this), shutdownTime * 1000);
  }),

  onWorking: co(function* () {
    if (this.idleTimeout !== null) {
      this.config.log('cancel pending shutdown');
      clearTimeout(this.idleTimeout);
      this.idleTimeout = null;
    }
  }),

  observe: function (taskListener) {
    this.taskListener = taskListener;
    this.taskListener.on('idle', this.onIdle);
    this.taskListener.on('working', this.onWorking);

    // Kick off the idle timer if we started in an idle state.
    if (taskListener.pending === 0) {
      this.onIdle();
    }
  }
};

module.exports = ShutdownManager;
