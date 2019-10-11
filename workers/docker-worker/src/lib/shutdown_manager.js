const { EventEmitter } = require('events');
const { spawn } = require('child_process');

class ShutdownManager extends EventEmitter {
  constructor(host, config) {
    super();
    this.idleTimeout = null;
    this.host = config.hostManager;
    this.config = config;
    this.monitor = config.monitor;
    this.nodeTerminationPoll = config.shutdown.nodeTerminationPoll || 5000;
    this.onIdle = this.onIdle.bind(this);
    this.onWorking = this.onWorking.bind(this);
    this.exit = false;

    process.on('SIGTERM', () => {
      this.config.log('Terminating worker due to SIGTERM');
      this.config.capacity = 0;
      this.exit = true;
      this.emit('nodeTermination', true);
    });
  }

  // Should we exit the process if we can
  // The flag is set to true on SIGTERM. We cannot
  // perform the exit in the signal handler because we
  // need to cleanup the running tasks first.
  shouldExit() {
    return this.exit;
  }

  async shutdown() {
    this.monitor.count('shutdown');
    // Add some vague assurance that we are not still claiming tasks.
    await this.taskListener.close();

    this.config.log('shutdown');
    spawn('shutdown', ['-h', 'now']);
  }

  onIdle() {
    let stats = {
      uptime: this.host.billingCycleUptime(),
      idleInterval: this.config.shutdown.afterIdleSeconds
    };

    this.config.log('uptime', stats);

    var shutdownTime = stats.idleInterval;
    this.config.log('pending shutdown', {
      time: shutdownTime
    });

    this.idleTimeout =
      setTimeout(this.shutdown.bind(this), shutdownTime * 1000);
  }

  onWorking() {
    if (this.idleTimeout !== null) {
      this.config.log('cancel pending shutdown');
      clearTimeout(this.idleTimeout);
      this.idleTimeout = null;
    }
  }

  observe(taskListener) {
    if (!this.config.shutdown.enabled) {
      this.config.log('shutdowns disabled');
      return;
    }

    this.taskListener = taskListener;
    this.taskListener.on('idle', this.onIdle);
    this.taskListener.on('working', this.onWorking);

    // Kick off the idle timer if we started in an idle state.
    if (taskListener.isIdle()) this.onIdle();
  }

  scheduleTerminationPoll() {
    return (async () => {
      if (this.terminationTimeout) clearTimeout(this.terminationTimeout);

      let terminated = await this.host.getTerminationTime();

      if (terminated) {
        this.exit = true;
        this.config.capacity = 0;
        this.emit('nodeTermination', terminated);
      }

      this.terminationTimeout = setTimeout(
        this.scheduleTerminationPoll.bind(this), this.nodeTerminationPoll
      );
    })();
  }
}

module.exports = ShutdownManager;
