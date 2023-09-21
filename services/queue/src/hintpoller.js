let assert = require('assert');
let _ = require('lodash');

/**
 * HintPoller polls for hints for pending tasks.
 *
 * The azure queues don't know if a task is pending they just store hints of
 * pending tasks. To be understood this way:
 *  A) If a task is pending, there is a hint of the task in an azure queue,
 *  B) If there is an hint in an azure queue, it may or may not be pending.
 *
 * It's an if, but not an only-if (think over-approximation).
 *
 * @class HintPoller
 * @param {string} taskQueueId - The ID of the task queue to poll for hints.
 * @param {Object} options - The options for the HintPoller.
 * @param {Monitor} options.monitor - The monitor object to use for logging.
 * @param {Function } options.pollPendingQueue - Function that fetches pending tasks for given queue
 * @param {Function} options.onError - The function to call if an error occurs.
 * @param {Function} options.onDestroy - The function to call when the HintPoller is destroyed.
 */
class HintPoller {
  constructor(taskQueueId, { monitor, pollPendingQueue, onError, onDestroy }) {
    this.taskQueueId = taskQueueId;
    this.monitor = monitor;
    this.pollPendingQueue = pollPendingQueue;
    this.onError = onError;
    this.onDestroy = onDestroy;
    this.requests = [];
    this.started = false;
    this.destroyed = false;
  }

  requestClaim(count, aborted) {
    assert(!this.destroyed, 'requestClaim() called after destroy()');
    return new Promise((resolve, reject) => {
      // Make a request for count tasks
      let request = { resolve, reject, count };
      this.requests.push(request);

      // Remove request if aborted
      aborted.then(() => {
        // Remove request from requests, but modifying the requests array
        _.pull(this.requests, request);
        // Resolve request empty array
        request.resolve([]);
      }).catch(reject);

      // Start polling
      this.start();
    });
  }

  start() {
    if (!this.started) {
      this.started = true;
      this.poll().catch(err => {
        this.started = false;
        // Resolve everything as failed
        let requests = this.requests;
        this.requests = [];
        this.destroy();
        requests.map(r => r.reject(err));
      }).catch(err => {
        process.nextTick(() => this.onError(err));
      });
    }
  }

  /**
   * we probably don't have to fetch all tasks and then release unused ones?
   * .?
   */
  async poll() {
    // While we have requests for hints
    while (_.sumBy(this.requests, 'count') > 0) {
      let claimed = 0;
      let released = 0;

      // While limit of hints requested is greater zero, and we are getting
      // hints from the queue we continue to claim from this queue
      let limit, hints;
      let i = 10; // count iterations a limit to 10, before we start over
      while ((limit = _.sumBy(this.requests, 'count')) > 0 &&
          (hints = await this.pollPendingQueue(this.taskQueueId, limit)).length > 0 && i-- > 0) {
        // Count hints claimed
        claimed += hints.length;

        // While we have hints and requests for hints we resolve requests
        while (hints.length > 0 && this.requests.length > 0) {
          let { resolve, count } = this.requests.shift();
          resolve(hints.splice(0, count));
        }

        // Release remaining hints (this shouldn't happen often!)
        await Promise.all(hints.map(hint => hint.release()));
        released += hints.length;
      }

      // If nothing was claimed, we sleep 1000ms before polling again
      let slept = false;
      if (claimed === 0) {
        slept = true;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      this.monitor.log.hintPoller({
        claimed,
        released,
        slept,
      });
    }

    // No more requests, let's clean-up
    this.destroy();
  }

  destroy() {
    // Remove entry from parent
    this.destroyed = true;
    this.onDestroy();
    assert(_.sumBy(this.requests, 'count') === 0,
      'destroying while we have pending requests is not allowed');
  }
}

module.exports = HintPoller;
