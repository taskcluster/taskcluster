import Debug from 'debug';
import { slugid } from 'taskcluster-client';
import PulseIterator from './PulseIterator';
import MessageIterator from './MessageIterator';
import EventIterator from './EventIterator';
import Subscription from './Subscription';

const debug = Debug('PulseEngine');

export default class PulseEngine {
  /* Operation:
   *
   * Each subscription gets one queue (named after the subscriptionId), with a
   * binding for each item in `subscriptions`. We then consume from that queue.
   * All queues are ephemeral, meaning they will go away when this service
   * restarts or the connection recycles. We automatically re-bind on
   * connection recycles, and rely on the caller to re-subscribe on service
   * restart. */

  constructor({ monitor, pulseClient }) {
    this.monitor = monitor;
    this.subscriptions = new Map();

    this.client = pulseClient;

    if (this.client.isFakeClient) {
      // we are now set up to accept subscription requests, but won't do
      // anything with them.
      return;
    }

    this.reset();
    this.client.onConnected(conn => this.connected(conn));

    // Promise that we're done reloading, used to serialize reload operations
    this._reloadDone = Promise.resolve();
  }

  reset() {
    this.connection = null;
  }

  connected(connection) {
    debug('Connected to AMQP server');

    // reset everything and reconcile
    Array.from(this.subscriptions.values()).forEach(sub => sub.reset());
    this.reset();
    this.connection = connection;
    this.reconcileSubscriptions();
  }

  subscribe(subscriptions, onMessage, onError) {
    const subscriptionId = slugid();

    this.subscriptions.set(
      subscriptionId,
      new Subscription({
        subscriptionId,
        onMessage,
        onError,
        subscriptions,
      })
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

  /**
   * Execute async `reloader` function, after any earlier async `reloader`
   * function given this function has completed. Ensuring that the `reloader`
   * functions are executed in serial.
   */
  _syncReload(reloader) {
    return this._reloadDone = this._reloadDone.catch(() => {}).then(reloader);
  }

  innerReconcileSubscriptions() {
    return this._syncReload(async () => {
      debug('Reconciling subscriptions');

      const { connection, client } = this;

      // if there's no connection, there's nothing to do; reconciliation
      // will occur again on the next connection
      if (!connection) {
        return;
      }

      await Promise.all(
        Array.from(this.subscriptions.values()).map(sub =>
          sub.reconcile(client, connection)
        )
      );

      // clean up any garbage
      Array.from(this.subscriptions.values())
        .filter(sub => sub.garbage)
        .forEach(sub => this.subscriptions.delete(sub.subscriptionId));
    });
  }

  /**
   * Return an async iterator that yields messages {[eventName]:
   * {payload, exchange, routingKey, redelivered, cc}
   */
  messageIterator(eventName, subscriptions) {
    return new MessageIterator(
      new PulseIterator(this, subscriptions),
      eventName
    );
  }

  /**
   * Return an async iterator that yields events {[eventName]: payload}
   */
  eventIterator(eventName, subscriptions) {
    return new EventIterator(new PulseIterator(this, subscriptions), eventName);
  }
}
