const { default: PQueue } = require('p-queue');

/**
 * All cloud providers we interface with have things like api request rate
 * limiting. This class provides an abstracted way to talk to them but pause
 * with backoffs when we're told to slow down.
 *
 * The constructor takes an array of `types`, each of which will be an individual
 * queue. This is useful because clouds often have different categories of request
 * tracked differently or count limits separately across regions.
 *
 * It also takes `apiRateLimits` which should have a key for each `type` and values
 * of `{interval, intervalCap}`. The meanings of these values can be found in
 * p-queue documentation. For each of these you can also specify a default for if you
 * have not set a value for a type.
 *
 * You must provide a taskcluster-lib-monitor logger to this class.
 *
 * Finally, it takes an `errorHandler` which is a function that takes an error and `tries` counter
 * as the arguments and must throw an error or return an object containing three values:
 *   backoff: which is a time in ms for how long requests should be paused
 *   level: a taskcluster-lib-monitor logging level for the message about this
 *   reason: a human-readable reason for the backoff
 * If you throw an error, this class will pass the error right back along to where
 * you called enqueue in the first place. This should be used for errors that are
 * expected or should not pause the entire provider.
 */
class CloudAPI {

  constructor({
    types,
    apiRateLimits,
    intervalDefault,
    intervalCapDefault,
    monitor,
    errorHandler,
    providerId,
  }) {
    this.queues = {};
    this.providerId = providerId;
    this.errorHandler = errorHandler;
    this.monitor = monitor;
    for (const type of types) {
      const { interval, intervalCap } = (apiRateLimits[type] || {});
      this.queues[type] = new PQueue({
        interval: interval || intervalDefault,
        intervalCap: intervalCap || intervalCapDefault,
      });
    }
  }

  async enqueue(type, func, tries = 0) {
    const queue = this.queues[type];
    if (!queue) {
      throw new Error(`Unknown p-queue attempted: ${type}`);
    }
    try {
      return await queue.add(func, { priority: tries });
    } catch (err) {
      let { backoff, level, reason } = this.errorHandler({ err, tries });

      if (!queue.isPaused) {
        this.monitor.log.cloudApiPaused({
          providerId: this.providerId,
          queueName: type,
          reason: reason || 'unknown',
          queueSize: queue.size,
          duration: backoff,
        }, { level: level || 'notice' });
        queue.pause();
        setTimeout(() => {
          this.monitor.log.cloudApiResumed({
            providerId: this.providerId,
            queueName: type,
          });
          queue.start();
        }, backoff);
      }

      if (tries > 4) {
        throw err;
      }

      return await this.enqueue(type, func, tries + 1);
    }
  }
}

module.exports = {
  CloudAPI,
};
