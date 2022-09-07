/**
 * Implements locked queue to allow one routine running at a time
 */
class QueueLock {
  constructor() {
    this.locks = new Map();
    this.queue = {};
  }

  acquire(name) {
    if (!this.queue[name]) {
      this.queue[name] = [];
    }

    const [ promise, resolver ] = this._createPromise();

    if (!this.locks.has(name)) {
      this.locks.set(name, true);
      resolver();
    } else {
      this.queue[name].push(resolver);
    }

    return promise;
  }

  release(name) {
    const nextResolver = this.queue[name].shift();
    if (nextResolver) {
      nextResolver();
    } else {
      this.locks.delete(name);
    }
  }

  _createPromise() {
    let resolver;
    return [
      new Promise((resolve) => { resolver = resolve; }),
      resolver,
    ];
  }
}

module.exports = QueueLock;
