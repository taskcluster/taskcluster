import { $$asyncIterator } from 'iterall';
import { List } from 'immutable';

export default class PulseIterator {
  /**
   * Construct an AsyncIterator for the given subscriptions, of the form
   * [{exchange, pattern}].  The resulting values are of the form {payload,
   * exchange, routingKey, redelivered, CC}.
   */
  constructor(pulseEngine, subscriptions) {
    this.pulseEngine = pulseEngine;
    this.pullQueue = List(); // eslint-disable-line babel/new-cap
    this.pushQueue = List(); // eslint-disable-line babel/new-cap
    this.listening = true;
    this.subscriptionId = this.pulseEngine.subscribe(
      subscriptions,
      this.pushValue.bind(this),
      this.setError.bind(this),
    );
  }

  next() {
    if (!this.listening) {
      return this.error ? Promise.reject(this.error) : Promise.resolve({done: true});
    }
    return this.pullValue();
  }

  return() {
    this.emptyQueue();

    return Promise.resolve({ value: undefined, done: true });
  }

  throw(error) {
    this.emptyQueue();

    return Promise.reject(error);
  }

  [$$asyncIterator]() {
    return this;
  }

  // cause this to throw the given error for all pending and subsequent next() calls
  setError(error) {
    this.error = error;
    this.emptyQueue();
  }

  pushValue(value) {
    if (this.error) {
      return;
    }

    if (this.pullQueue.size !== 0) {
      this.pullQueue.first()[0]({ value, done: false });
      this.pullQueue = this.pullQueue.shift();
    } else {
      this.pushQueue = this.pushQueue.push(value);
    }
  }

  pullValue() {
    return new Promise((resolve, reject) => {
      if (this.pushQueue.size !== 0) {
        resolve({ value: this.pushQueue.first(), done: false });
        this.pushQueue = this.pushQueue.shift();
      } else {
        this.pullQueue = this.pullQueue.push([resolve, reject]);
      }
    });
  }

  emptyQueue() {
    if (!this.listening) {
      return;
    }

    this.listening = false;
    this.pulseEngine.unsubscribe(this.subscriptionId);
    if (this.error) {
      this.pullQueue.forEach(([resolve, reject]) => reject(this.error));
    } else {
      this.pullQueue.forEach(([resolve]) => resolve({done: true}));
    }
    this.pullQueue = this.pullQueue.clear();
    this.pushQueue = this.pushQueue.clear();
  }
}
