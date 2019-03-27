import Debug from 'debug';
import { slugid } from 'taskcluster-client';
import PulseIterator from './PulseIterator';
import MessageIterator from './MessageIterator';
import EventIterator from './EventIterator';

const debug = Debug('PulseEngine');

class Subscription {
  constructor({ subscriptionId, onMessage, onError, subscriptions }) {
    this.subscriptionId = subscriptionId;
    this.onMessage = onMessage;
    this.onError = onError;
    this.subscriptions = subscriptions;

    // state tracking for reconciliation
    this.listening = false;
    this.unsubscribed = false;
  }

  /**
   * Reset this subscription to its non-listening state
   */
  reset() {
    this.listening = false;
    this.connection = null;
    this.channel = null;
  }

  /**
   * Flag this subscription as needing unsubscription at the next
   * reconciliation
   */
  unsubscribe() {
    this.unsubscribed = true;
  }

  /**
   * Reconcile the AMQP state with this subscription's state.
   */
  async reconcile(client, connection) {
    const { subscriptionId, listening, unsubscribed } = this;
    const queueName = client.fullObjectName('queue', subscriptionId);

    if (!this.channel || connection !== this.connection) {
      this.connection = connection;
      this.channel = await connection.amqp.createChannel();
      // intercept 'error' events so they don't kill the connection (they are
      // also raised as exceptions and handled that way)
      this.channel.on('error', () => {});
    }

    const { channel } = this;

    // all errors from here on are handled by calling the subscription's `onError`
    // method and considering the subscription reconciled.  So errors are not bubbled
    // up to the caller and will not interfere with other subscriptions.
    try {
      if (listening && unsubscribed) {
        debug(`Unbinding subscription ${subscriptionId}`);
        await channel.cancel(this.consumerTag);
        await channel.deleteQueue(queueName);
        await channel.close();
        this.listening = false;
      } else if (!listening && !unsubscribed) {
        debug(`Binding subscription ${subscriptionId}`);
        const { onMessage, subscriptions } = this;

        await channel.assertQueue(queueName, {
          exclusive: false,
          durable: true,
          autoDelete: true,
        });

        // perform the queue binding in a new channel, so that the existing channel
        // persists if something egregious -- like an exchange that doesn't exist --
        // occurs.
        const bindChannel = await connection.amqp.createChannel();
        // intercept 'error' events so they don't kill the connection (they are
        // also raised as exceptions and handled that way)
        bindChannel.on('error', () => {});
        try {
          for (let {pattern, exchange} of subscriptions) {
            await bindChannel.bindQueue(queueName, exchange, pattern);
          }
        } catch (err) {
          // drop the queue since it's partially bound..
          await channel.deleteQueue(queueName);
          // report the error..
          debug(`Binding to ${queueName} failed: ${err}`);
          // (converting to a string for transfer to the client)
          this.onError(new Error(`Error binding queue: ${err}`));
          // and consider this reconciliation complete..
          return;
        }
        await bindChannel.close();

        const { consumerTag } = await channel.consume(queueName, (amqpMsg, err) => {
          // "If the consumer is cancelled by RabbitMQ, the message callback will be invoked with null."
          // This is most likely due to the queue being deleted, so we just report it to the user.
          if (!amqpMsg) {
            this.onError(`Consumer cancelled by RabbitMQ`);
            return;
          }
          const message = {
            payload: JSON.parse(amqpMsg.content.toString('utf8')),
            exchange: amqpMsg.fields.exchange,
            routingKey: amqpMsg.fields.routingKey,
            redelivered: amqpMsg.fields.redelivered,
            cc: [],
          };

          if (
            amqpMsg.properties &&
            amqpMsg.properties.headers &&
            Array.isArray(amqpMsg.properties.headers.cc)
          ) {
            message.cc = amqpMsg.properties.headers.cc;
          }

          onMessage(message);
        });

        this.consumerTag = consumerTag;
        this.listening = true;
      }
    } catch (err) {
      debug(`Reconciling subscription ${subscriptionId}: ${err}`);
      this.onError(new Error(`Error reconciling subscription: ${err}`));

      // try to delete the queue, just to be safe, but if it doesn't work, oh well..
      try {
        await this.channel.deleteQueue(queueName);
      } catch (err) {
        // ignored
      }

      // and similarly try to close the channel (which will close any consumer if it
      // exists), but if it doesn't work, oh well..
      try {
        await this.channel.close();
      } catch (err) {
        // ignored
      }

      // mark this subscription as unsubscribed so we don't try again
      this.channel = null;
      this.consumerTag = null;
      this.unsubscribed = true;
      this.listening = false;
    }
  }

  /**
   * If true, this subscription is complete and can be dropped from the list.
   */
  get garbage() {
    return this.unsubscribed && !this.listening;
  }
}

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
