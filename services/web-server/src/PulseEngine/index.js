import { PulseConnection, PulseListener } from 'taskcluster-client';
import amqpMatch from 'amqp-match';
import AsyncIterator from './AsyncIterator';

export default class PulseEngine {
  constructor(options = {}) {
    const { connection } = options;

    this.listening = false;
    this.currentSubscriptionId = 0;
    this.subscriptions = new Map();
    this.connection = new PulseConnection(connection);
    this.listener = new PulseListener({
      connection: this.connection,
      rootUrl: process.env.TASKCLUSTER_ROOT_URL,
    });

    this.listener.on('message', this.handleMessage.bind(this));
  }

  handleMessage(message) {
    [...this.subscriptions.values()].forEach(
      ({ bindings, eventName, onMessage }) => {
        bindings.forEach(({ exchange, routingKeyPattern }) => {
          if (
            message.exchange === exchange &&
            amqpMatch(message.routingKey, routingKeyPattern)
          ) {
            onMessage({ [eventName]: message.payload });
          }
        });
      }
    );
  }

  async subscribe({ eventName, triggers }, onMessage) {
    const id = this.currentSubscriptionId;
    const bindings = [];

    Object.entries(triggers).forEach(([routingKeyPattern, exchanges]) => {
      exchanges.forEach(exchange => {
        const binding = { exchange, routingKeyPattern };

        this.listener.bind(binding);
        bindings.push(binding);
      });
    });
    this.subscriptions.set(id, { eventName, bindings, onMessage });
    this.currentSubscriptionId = this.currentSubscriptionId + 1;

    if (!this.listening) {
      await this.listener.resume();
      this.listening = true;
    }

    return id;
  }

  async unsubscribe(subscriptionId) {
    this.subscriptions.delete(subscriptionId);

    if (!this.subscriptions.size) {
      await this.listener.pause();
      this.listening = false;
    }
  }

  asyncIterator(eventName, triggers) {
    return new AsyncIterator(this, { eventName, triggers });
  }
}
