const { $$asyncIterator } = require('iterall');
const { List } = require('immutable');

module.exports = class PulseIterator {
  /**
   * Construct an AsyncIterator for the given subscriptions, of the form
   * [{exchange, pattern}].  The resulting values are of the form {payload,
   * exchange, routingKey, redelivered, CC}.
   *
   * Because messages come from Pulse in a "push" fashion, but are consumed by
   * a "pull" operation (the `next` method), this class buffers outstanding
   * push and pull operations and then matches them up in its `match()` method.
   */
  constructor(pulseEngine, subscriptions) {
    this.pulseEngine = pulseEngine;
    this.pullQueue = List();
    this.pushQueue = List();
    this.listening = true;
    this.subscriptionId = this.pulseEngine.subscribe(
      subscriptions,
      this.pushValue.bind(this),
      this.pushError.bind(this),
    );
  }

  next() {
    // pull a value from the iterator; the resulting promise resolves when a value
    // is available or the iterator is finished, and rejects if the iterator encounters
    // an error
    return new Promise((resolve, reject) => {
      this.pullQueue = this.pullQueue.push({ resolve, reject });
      this.match();
    });
  }

  return() {
    this.stop({ done: true });

    // return should always succeed, even if an error was introduced
    return Promise.resolve({ done: true });
  }

  throw(error) {
    this.pushError(error);

    return Promise.reject(error);
  }

  [$$asyncIterator]() {
    return this;
  }

  // cause this to throw the given error for all pending and subsequent next() calls
  pushError(error) {
    this.stop({ error, done: true });
  }

  // insert a value into the queue; the resulting promise resolves when the value
  // is consumed, and rejects if the iterator finishes without consuming the value
  pushValue(value) {
    if (!this.listening) {
      return Promise.reject(new Error('iterator cancelled'));
    }
    return new Promise((resolve, reject) => {
      this.pushQueue = this.pushQueue.push({ resolve, reject, value, done: false });
      this.match();
    });
  }

  stop(push) {
    if (this.listening) {
      this.listening = false;
      this.pulseEngine.unsubscribe(this.subscriptionId);

      // reject any pending pushes and then replace with a single, persistent push
      const err = new Error('iterator cancelled');
      this.pushQueue.forEach(({ reject }) => reject(err));
      this.pushQueue = this.pushQueue.clear().push(push);
    }
    this.match();
  }

  match() {
    while (this.pushQueue.size !== 0 && this.pullQueue.size !== 0) {
      const push = this.pushQueue.first();
      const pull = this.pullQueue.first();

      this.pullQueue = this.pullQueue.shift();
      if (!push.done) {
        this.pushQueue = this.pushQueue.shift();
      }

      if (push.error) {
        pull.reject(push.error);
      } else {
        pull.resolve({ value: push.value, done: push.done });
      }

      if (push.resolve) {
        push.resolve();
      }
    }
  }
};
