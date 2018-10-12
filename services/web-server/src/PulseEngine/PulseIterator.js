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
      this.pushValue.bind(this)
    );
  }

  next() {
    return this.listening ? this.pullValue() : this.return();
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

  pushValue(value) {
    if (this.pullQueue.size !== 0) {
      this.pullQueue.first()({ value, done: false });
      this.pullQueue = this.pullQueue.shift();
    } else {
      this.pushQueue = this.pushQueue.push(value);
    }
  }

  pullValue() {
    return new Promise(resolve => {
      if (this.pushQueue.size !== 0) {
        resolve({ value: this.pushQueue.first(), done: false });
        this.pushQueue = this.pushQueue.shift();
      } else {
        this.pullQueue = this.pullQueue.push(resolve);
      }
    });
  }

  emptyQueue() {
    if (!this.listening) {
      return;
    }

    this.listening = false;
    this.pulseEngine.unsubscribe(this.subscriptionId);
    this.pullQueue.forEach(resolve =>
      resolve({
        value: undefined,
        done: true,
      })
    );
    this.pullQueue = this.pullQueue.clear();
    this.pushQueue = this.pushQueue.clear();
  }
}
