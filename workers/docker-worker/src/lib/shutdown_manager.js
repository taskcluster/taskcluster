const { EventEmitter } = require('events');

/**
 * Manage worker shutdown, either from a graceful-termination message from
 * the worker-runner, or due to idleness.
 *
 * This takes signals from other components in its `onXxx` methods, and
 * produces a value from `shouldExit` that directs the TaskListener's behavior.
 *
 * Note that the worker is assumed to be working on startup, to avoid premature
 * shutdown due to a very-short afterIdleSeconds configuration.
 */
class ShutdownManager extends EventEmitter {
  constructor(host, config) {
    super();
    this.idleTimeout = null;
    this.host = host;
    this.config = config;
    this.monitor = config.monitor;
    this.exit = false;

    this.shutdownCfg = config.shutdown || {};
    this.nodeTerminationPoll = this.shutdownCfg.nodeTerminationPoll || 5000;

    process.on('SIGTERM', () => {
      this.config.log('Terminating worker due to SIGTERM');
      this._setExit('immediate');
    });
  }

  // Should we exit the process?  Returns false, "graceful", or "immediate".
  shouldExit() {
    return this.exit;
  }

  /**
   * The worker is idle at the moment.  If it has just become idle,
   * then this will start an idle timer.  It's safe to call this repeatedly.
   */
  onIdle() {
    if (!this.shutdownCfg.enabled || this.idleTimeout) {
      return;
    }

    let afterIdleSeconds = this.shutdownCfg.afterIdleSeconds;

    let stats = {
      uptime: this.host.billingCycleUptime(),
      idleInterval: afterIdleSeconds,
    };

    this.config.log('uptime', stats);

    this.config.log('worker idle', {afterIdleSeconds});

    if (afterIdleSeconds) {
      this.idleTimeout = setTimeout(() => {
        // use a graceful timeout as a failsafe: if somehow a task
        // gets started after this, let's let it finish.
        this._setExit('graceful');
      }, afterIdleSeconds * 1000);
    }
  }

  /**
   * The worker is working at the moment.  This cancels any running idle
   * timers.  It's safe to call this repeatedly.
   */
  onWorking() {
    if (!this.shutdownCfg.enabled || !this.idleTimeout || this.shouldExit()) {
      return;
    }

    this.config.log('worker working');
    clearTimeout(this.idleTimeout);
    this.idleTimeout = null;
  }

  // Set this.exit, but never downgrade (e.g., immediate -> graceful)
  _setExit(exit) {
    if (this.exit === 'immediate' && exit === 'graceful') {
      return;
    }
    this.exit = exit;
  }

  scheduleTerminationPoll() {
    return (async () => {
      if (this.terminationTimeout) {clearTimeout(this.terminationTimeout);}

      let terminated = await this.host.getTerminationTime();
      if (terminated) {
        this.exit = 'immediate';
      }

      this.terminationTimeout = setTimeout(
        this.scheduleTerminationPoll.bind(this), this.nodeTerminationPoll,
      );
    })();
  }
}

module.exports = ShutdownManager;
