import { hrtime } from 'process';
import pqueue from 'p-queue';
const PQueue = pqueue.default;

export const measureTime = () => {
  const start = hrtime.bigint();
  return () => Number(hrtime.bigint() - start) / 1e6;
};

const defaultMetrics = () => ({
  total: 0,
  success: 0,
  failed: 0,
  retries: 0,
  elapsed: 0,
  /** @type {number[]} */
  durations: [],
  /** @type {Record<number, number>} */
  byStatus: {},
});

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
 * To avoid calls being stuck for a long period of time, we can also pass `timeout` and
 * `throwOnTimeout`.
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
 *
 * Passing `collectMetrics: true` will enable collection of API call times, success/failure counts,
 * retries and status codes. Call `.resetMetrics()` to reset collected stats between runs if needed.
 */
export class CloudAPI {

  constructor({
    types,
    apiRateLimits,
    intervalDefault,
    intervalCapDefault,
    monitor,
    errorHandler,
    providerId,
    timeout = undefined,
    throwOnTimeout = false,
    collectMetrics = false,
  }) {
    this.queues = {};
    this.providerId = providerId;
    this.errorHandler = errorHandler;
    this.monitor = monitor;
    this.collectMetrics = collectMetrics;
    this.metrics = defaultMetrics();
    for (const type of types) {
      const { interval, intervalCap } = (apiRateLimits[type] || {});
      this.queues[type] = new PQueue({
        interval: interval || intervalDefault,
        intervalCap: intervalCap || intervalCapDefault,
        timeout,
        throwOnTimeout,
      });
    }
  }

  async enqueue(type, func, tries = 0) {
    const queue = this.queues[type];
    if (!queue) {
      throw new Error(`Unknown p-queue attempted: ${type}`);
    }
    const getElapsed = this.collectMetrics ? measureTime() : null;
    let success = true;
    let statusCode = 200;
    try {
      return await queue.add(func, { priority: tries });
    } catch (err) {
      let { backoff, level, reason } = this.errorHandler({ err, tries });
      success = false;
      statusCode = err.statusCode || err.code || 500;

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
    } finally {
      if (this.collectMetrics && getElapsed) {
        this._logMetric({
          success,
          elapsed: getElapsed(),
          statusCode,
          isRetry: tries > 0,
        });
      }
    }
  }

  /**
   * @private
   * @param {{ success: boolean, elapsed: number, statusCode: number, isRetry: boolean }} opts
   */
  _logMetric({ success, elapsed, statusCode, isRetry }) {
    this.metrics.total++;
    if (success) {
      this.metrics.success++;
    } else {
      this.metrics.failed++;
    }
    if (isRetry) {
      this.metrics.retries++;
    }
    this.metrics.elapsed += elapsed;
    this.metrics.durations.push(elapsed);
    if (statusCode) {
      this.metrics.byStatus[statusCode] = (this.metrics.byStatus[statusCode] || 0) + 1;
    }
  }

  /**
   * Calculate and log metrics using `cloud-api-metrics` monitor logger.
   * This will reset the metrics after logging.
   */
  logAndResetMetrics() {
    const durations = [...this.metrics.durations].sort((a, b) => a - b);
    const len = durations.length;

    /** @param {number} p */
    const getPercentile = (p) => durations[Math.floor(len * p)];

    this.monitor.log.cloudApiMetrics({
      providerId: this.providerId,
      total: this.metrics.total,
      success: this.metrics.success,
      failed: this.metrics.failed,
      retries: this.metrics.retries,
      byStatus: this.metrics.byStatus,
      min: len > 0 ? durations[0] : 0,
      max: len > 0 ? durations[len - 1] : 0,
      avg: len > 0 ? this.metrics.elapsed / len : 0,
      median: len > 0 ? getPercentile(0.5) : 0,
      p95: len > 0 ? getPercentile(0.95) : 0,
      p99: len > 0 ? getPercentile(0.99) : 0,
    });

    // reset metrics
    this.metrics.durations.splice(0, this.metrics.durations.length); // avoid memory leaks
    this.metrics = defaultMetrics();
  }
}
