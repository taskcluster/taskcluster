const assert = require('assert');
const debug = require('debug')('queue-lock');

/**
 * Implements locked queue to allow one routine running at a time
 */
class QueueLock {
  constructor({
    maxLockTimeMs = 0, // if > 0, lock will be auto released after given ms
  } = {}) {
    assert(maxLockTimeMs >= 0, 'negative max time lock');

    this.locks = new Map();
    this.queue = {};
    this.maxLockTimeMs = maxLockTimeMs;
  }

  /**
   * Acquire an exclusive lock for a given named queue
   * Returns promise that resolves with release function
   *
   * @param {string} name Name of the queue
   * @returns {Promise}
   */
  acquire(name) {
    if (!this.queue[name]) {
      this.queue[name] = [];
    }

    const promise = this._createPromise(name);

    if (!this.locks.has(name)) {
      this.locks.set(name, true);
      promise.resolve();
    } else {
      this.queue[name].push(promise);
    }

    return promise.promise;
  }

  /**
   * Takes next client and resolves its 'acquire' promise
   * All listeners are being processed sequentially
   * in the order they acquired their locks
   *
   * @internal
   * @param {string} name
   */
  _release(name) {
    const next = this.queue[name].shift();
    if (next) {
      next.resolve();
    } else {
      this.locks.delete(name);
    }
  }

  /**
   * Create a promise and a resolve function
   * Resolve function will return `releaseLock()` function
   * that should be called by the client code
   *
   * If `maxLockTimeMs` is set, additional auto release timeout will be set
   * Lock will be released at most once in this case, either by timeout or
   * by client calling release directly.
   * This is to ensure that auto-release is only releasing own lock
   *
   * @internal
   * @param {*} name
   * @returns {Object} { promise, resolve }
   */
  _createPromise(name) {
    let resolver;
    let autoRelease;
    let alreadyReleased = false;

    const promise = new Promise((resolve) => { resolver = resolve; });
    const release = () => {
      if (alreadyReleased) {
        return;
      }

      if (autoRelease) {
        clearInterval(autoRelease);
      }
      alreadyReleased = true;
      this._release(name);
    };

    if (this.maxLockTimeMs) {
      autoRelease = setTimeout(() => {
        debug(`Auto-release ${name}`);
        release();
      }, this.maxLockTimeMs);
    }

    return {
      promise,
      resolve: () => resolver(release),
    };
  }
}

module.exports = QueueLock;
