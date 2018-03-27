import { $$asyncIterator } from 'iterall';
import { List } from 'immutable';

export default class AsyncIterator {
  constructor(pubsub, eventNames) {
    this.pubsub = pubsub;
    this.pullQueue = List(); // eslint-disable-line babel/new-cap
    this.pushQueue = List(); // eslint-disable-line babel/new-cap
    this.listening = true;
    this.events = Array.isArray(eventNames) ? eventNames : [eventNames];
    this.allSubscribed = this.subscribeAll();
  }

  async next() {
    await this.allSubscribed;

    return this.listening ? this.pullValue() : this.return();
  }

  async return() {
    this.emptyQueue(await this.allSubscribed);

    return { value: undefined, done: true };
  }

  async throw(error) {
    this.emptyQueue(await this.allSubscribed);

    return Promise.reject(error);
  }

  [$$asyncIterator]() {
    return this;
  }

  async pushValue(event) {
    await this.allSubscribed;

    if (this.pullQueue.size !== 0) {
      this.pullQueue.first()({ value: event, done: false });
      this.pullQueue = this.pullQueue.shift();
    } else {
      this.pushQueue = this.pushQueue.push(event);
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

  emptyQueue(subscriptionIds) {
    if (!this.listening) {
      return;
    }

    this.listening = false;
    this.unsubscribeAll(subscriptionIds);
    this.pullQueue.forEach(resolve =>
      resolve({
        value: undefined,
        done: true,
      })
    );
    this.pullQueue = this.pullQueue.clear();
    this.pushQueue = this.pushQueue.clear();
  }

  subscribeAll() {
    return Promise.all(
      this.events.map(eventName =>
        this.pubsub.subscribe(eventName, this.pushValue.bind(this), {})
      )
    );
  }

  unsubscribeAll(subscriptionIds) {
    subscriptionIds.forEach(subscriptionId =>
      this.pubsub.unsubscribe(subscriptionId)
    );
  }
}
