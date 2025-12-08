export default class Subscription {
  constructor({ subscriptionId, handleMessage, handleError, monitor, subscriptions }) {
    this.subscriptionId = subscriptionId;
    this.handleMessage = handleMessage;
    this.handleError = handleError;
    this.monitor = monitor;
    this.subscriptions = subscriptions;

    // the identifier for the active consumer, if any (used to cancel it)
    this.consumerTag = null;

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

    // all errors from here on are handled by calling the subscription's `handleError`
    // method and considering the subscription reconciled.  So errors are not bubbled
    // up to the caller and will not interfere with other subscriptions.
    try {
      if (listening && unsubscribed) {
        this.monitor.log.unbindPulseSubscription({ subscriptionId });
        await channel.cancel(this.consumerTag);
        await channel.deleteQueue(queueName);
        await channel.close();
        this.listening = false;
      } else if (!listening && !unsubscribed) {
        this.monitor.log.bindPulseSubscription({ subscriptionId });
        const { handleError, handleMessage, subscriptions } = this;

        // declare the queue, with autoDelete and exclusive both set to false so that
        // the queue will stick around if we need to reconnect, but with a short TTL
        // so that if we "forget" about the queue, it will be deleted quickly.
        await channel.assertQueue(queueName, {
          exclusive: false,
          durable: true,
          autoDelete: false,
          expires: 30000, // 30 seconds, long enough for a reconnect
          arguments: { 'x-queue-type': 'quorum' },
        });

        // perform the queue binding in a new channel, so that the existing channel
        // persists if something egregious -- like an exchange that doesn't exist --
        // occurs.
        const bindChannel = await connection.amqp.createChannel();
        // intercept 'error' events so they don't kill the connection (they are
        // also raised as exceptions and handled that way)
        bindChannel.on('error', () => {});
        try {
          for (let { pattern, exchange } of subscriptions) {
            await bindChannel.bindQueue(queueName, exchange, pattern);
          }
        } catch (err) {
          // drop the queue since it's partially bound..
          await channel.deleteQueue(queueName);
          // report the error..
          // (converting to a string for transfer to the client)
          handleError(new Error(`Error binding queue: ${err}`));
          // and consider this reconciliation complete..
          return;
        }
        await bindChannel.close();

        const { consumerTag } = await channel.consume(queueName, (amqpMsg, err) => {
          // "If the consumer is cancelled by RabbitMQ, the message callback will be invoked with null."
          // This is most likely due to the queue being deleted, so we just report it to the user.
          if (!amqpMsg) {
            handleError(`Consumer cancelled by RabbitMQ`);
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

          handleMessage(message).then(
            () => channel.ack(amqpMsg),
            () => channel.nack(amqpMsg));
        });

        this.consumerTag = consumerTag;
        this.listening = true;
      }
    } catch (err) {
      this.handleError(new Error(`Error reconciling subscription: ${err}`));

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
