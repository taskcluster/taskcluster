const { slugid } = require('taskcluster-client');
const PulseIterator = require('./PulseIterator');
const MessageIterator = require('./MessageIterator');
const EventIterator = require('./EventIterator');
const Subscription = require('./Subscription');
const pSynchronize = require('p-synchronize');

module.exports = class PulseEngine {
  /* Operation:
   *
   * Each subscription gets one queue (named after the subscriptionId), with a
   * binding for each item in `subscriptions`. We then consume from that queue.
   * We automatically re-bind on connection recycles, and rely on the caller to
   * re-subscribe on service restart.
   *
   * If the pulseClient is null, this will do nothing, as if no pulse messages
   * were received.
   */
  constructor({ monitor, pulseClient }) {
    this.monitor = monitor;
    this.subscriptions = new Map();

    this.client = pulseClient;

    if (!this.client) {
      // we are now set up to accept subscription requests, but won't do
      // anything with them.
      return;
    }

    this.reset();
    this.client.onConnected(conn => this.connected(conn));

    const sync = pSynchronize();
    this.innerReconcileSubscriptions = sync(() => this._innerReconcileSubscriptions());
  }

  reset() {
    this.connection = null;
  }

  connected(connection) {
    // reset everything and reconcile
    Array.from(this.subscriptions.values()).forEach(sub => sub.reset());
    this.reset();
    this.connection = connection;
    this.reconcileSubscriptions();
  }

  subscribe(subscriptions, handleMessage, handleError) {
    const subscriptionId = slugid();

    this.subscriptions.set(
      subscriptionId,
      new Subscription({
        subscriptionId,
        handleMessage,
        handleError,
        monitor: this.monitor,
        subscriptions,
      }),
    );
    this.reconcileSubscriptions();

    return subscriptionId;
  }

  unsubscribe(subscriptionId) {
    const sub = this.subscriptions.get(subscriptionId);

    if (sub) {
      sub.unsubscribe();
    }

    this.reconcileSubscriptions();
  }

  reconcileSubscriptions() {
    // handle async errors from reconciliation by reporting them
    this.innerReconcileSubscriptions().catch(err => {
      // if there's a connection active, signal that it has failed..
      if (this.connection) {
        this.connection.failed();
        this.reset();
      }

      // report the error and move on..
      this.monitor.reportError(err);
    });
  }

  async _innerReconcileSubscriptions() {
    const { connection, client } = this;

    // if there's no connection, there's nothing to do; reconciliation
    // will occur again on the next connection
    if (!connection) {
      return;
    }

    await Promise.all(
      Array.from(this.subscriptions.values()).map(sub =>
        sub.reconcile(client, connection),
      ),
    );

    // clean up any garbage
    Array.from(this.subscriptions.values())
      .filter(sub => sub.garbage)
      .forEach(sub => this.subscriptions.delete(sub.subscriptionId));
  }

  /**
   * Return an async iterator that yields messages {[eventName]:
   * {payload, exchange, routingKey, redelivered, cc}
   */
  messageIterator(eventName, subscriptions) {
    return new MessageIterator(
      new PulseIterator(this, subscriptions),
      eventName,
    );
  }

  /**
   * Return an async iterator that yields events {[eventName]: payload}
   */
  eventIterator(eventName, subscriptions) {
    return new EventIterator(new PulseIterator(this, subscriptions), eventName);
  }
};
