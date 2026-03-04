import debug from 'debug';
import amqplib from 'amqplib';
import assert from 'assert';
import slugid from 'slugid';

/**
 * Recognize some "expected", ignorable errors due to normal network failures.
 */
const isExpectedError = err => {
  // IllegalOperationError happens when we are draining a broken channel; ignore
  if (err instanceof amqplib.IllegalOperationError) {
    return true;
  }

  // similarly, an error with this text is sent in some failure modes.  See
  // https://github.com/streadway/amqp/issues/409 for a request for a better
  // way to recognize this
  if (err.message.match(/no reply will be forthcoming/)) {
    return true;
  }
};

/**
 * A PulseConsumer declares a queue and listens for messages on that
 * queue, invoking a callback for each message.
 *
 * If ephemeral is true, then this consumer will use ephemeral queues
 * that are deleted on disconnection.  This may lead to loss of messages,
 * and the caller must handle this via the onConnected handler.
 */
export class PulseConsumer {
  constructor({ client, bindings, queueName, ephemeral, prefetch, onConnected, handleMessage, ...queueOptions }) {
    assert(handleMessage, 'Must provide a message handler function');

    this.client = client;
    this.bindings = bindings;
    this.handleMessage = handleMessage;
    this.prefetch = typeof prefetch !== 'undefined' ? prefetch : 5;
    this.queueOptions = queueOptions;

    if (ephemeral) {
      assert(!queueName, 'Must not pass a queueName for ephemeral consumers');
      assert(onConnected, 'Must pass onConnected for ephemeral consumers');
    } else {
      assert(queueName, 'Must pass a queueName');
      this.queueName = queueName;
    }
    this.ephemeral = ephemeral;
    this.onConnected = onConnected || (() => {});

    this._handleConnection = this._handleConnection.bind(this);

    // false once stop() has been called
    this.running = true;

    // the current channel and consumerTag, if any
    this.channel = null;
    this.consumerTag = null;

    // number of messages being processed right now, and a function to call
    // when that number goes to zero
    this.processingMessages = 0;
    this.idleCallback = null;

    this.debug = debug('pulse-consumer');
  }

  /**
   * Create and bind the queue, then start listening.  When this method has
   * returned, the queue is established and bound to the exchanges given in
   * the consumer.
   *
   * In the public API, this is called automatically by `consume`
   */
  async _start() {
    // first make sure the queue is bound
    await this.client.withChannel(channel => this._createAndBindQueue(channel));

    // then set up to call _handleConnection on all connections
    this.stopHandlingConnections = this.client.onConnected(this._handleConnection);
  }

  /**
   * Stop listening.  After this call, no further messages will be consumed
   * from the queue.  The queue and any bindings will remain configured on the
   * server.  This method will return after any pending consumers have
   * completed (ack or nack).
   */
  async stop() {
    if (!this.running) {
      return;
    }
    this.running = false;

    // stop listening for new Connections
    this.stopHandlingConnections();

    // and drain the channel..
    await this._drainChannel();

    // (for testing)
    if (this._stoppedCallback) {
      this._stoppedCallback();
    }
  }

  /**
   * Stop listening on this channel, but don't actually stop the consumer. This is
   * done when the connection is recycling, when hopefully at the same time a new
   * connection is coming up.
   */
  async _drainChannel() {
    const { channel, consumerTag } = this;

    if (channel && consumerTag) {
      this.consumerTag = null;
      try {
        await channel.cancel(consumerTag);
      } catch (err) {
        if (!isExpectedError(err)) {
          throw err;
        }
      }
    }

    // if messages are being processed, arrange to continue when they
    // are all handled
    if (this.processingMessages > 0) {
      await new Promise(resolved => {
        this.idleCallback = resolved;
      });
    }

    if (channel) {
      this.channel = null;
      try {
        await channel.close();
      } catch (err) {
        if (!isExpectedError(err)) {
          throw err;
        }
      }
    }
  }

  async _createAndBindQueue(channel) {
    const queueName = this.client.fullObjectName(
      'queue',
      // for ephemeral queues, generate a new queueName on every connection,
      // as autodelete is not an immediate operation
      this.ephemeral ? slugid.nice() : this.queueName);
    await channel.assertQueue(queueName, {
      exclusive: this.ephemeral,
      durable: true,
      autoDelete: this.ephemeral,
      ...this.queueOptions,
      arguments: {
        ...(!this.ephemeral && { 'x-queue-type': 'quorum' }),
        ...this.queueOptions.arguments,
      },
    });

    for (let { exchange, routingKeyPattern } of this.bindings) {
      await channel.bindQueue(queueName, exchange, routingKeyPattern);
    }

    return queueName;
  }

  /**
   * Handle a new connection to the pulse server, re-declaring everything
   * and setting up the consumer.
   */
  async _handleConnection(conn) {
    try {
      if (!this.running) {
        return;
      }

      const amqp = conn.amqp;
      const channel = await amqp.createChannel();
      await channel.prefetch(this.prefetch);
      const queueName = await this._createAndBindQueue(channel);
      this.channel = channel;

      // consider any errors on the channel to be potentially fatal to the
      // connection (better safe than sorry)
      channel.on('error', () => conn.failed());

      // NOTE: channel.consume is not async!  In fact, await'ing it can
      // result in a message arriving before the onConnected callback is
      // invoked.
      const consumer = channel.consume(queueName, async (msg) => {
        // If the consumer is cancelled by RabbitMQ, the message callback will
        // be invoked with null.  This might happen if the queue is deleted, in
        // which case we probably want to reconnect and redeclare everything.
        if (msg === null) {
          this.debug(`${queueName} consumer was deleted by rabbitmq`);
          conn.failed();
          return;
        }

        try {
          this.processingMessages++;
          try {
            await this._handleMessage(msg);
          } catch (err) {
            if (msg.fields.redelivered) {
              // if this was already delivered, we're going to give up and report it
              channel.nack(msg, false, false);
              this.client.monitor.reportError(err, {
                queueName,
                exchange: msg.exchange,
                redelivered: msg.redelivered,
              });
            } else {
              channel.nack(msg, false, true);
            }
            return;
          }
          channel.ack(msg);
        } catch (err) {
          // the error handling in the inner try block went badly, so this
          // channel is probably sick; but if this is an expected error,
          // there's no need to report it (that is basically saying the channel
          // has closed, so we'll re-connect)
          if (!isExpectedError(err)) {
            this.client.monitor.reportError(err, {
              queueName,
              exchange: msg.exchange,
            });
          }
          conn.failed();
        } finally {
          this.processingMessages--;
          if (this.processingMessages === 0 && this.idleCallback) {
            this.idleCallback();
          }
        }
      });
      this.consumerTag = consumer.consumerTag;

      // now that we're listening for messages, inform the user that we were
      // reconnected and might have lost messages
      await this.onConnected();

      // when retirement of this connection begins, stop consuming on this
      // channel and close the channel as soon sa all messages are handled.
      conn.on('retiring', async () => {
        try {
          await this._drainChannel();
        } catch (err) {
          this.client.monitor.reportError(err);
        }
      });
    } catch (err) {
      this.client.monitor.reportError(err);
      conn.failed();
    }
  }

  async _handleMessage(msg) {
    // Construct message
    let message = {
      payload: JSON.parse(msg.content.toString('utf8')),
      exchange: msg.fields.exchange,
      routingKey: msg.fields.routingKey,
      redelivered: msg.fields.redelivered,
      routes: [],
    };

    // Find CC'ed routes
    if (msg.properties && msg.properties.headers &&
        msg.properties.headers.CC instanceof Array) {
      message.routes = msg.properties.headers.CC.filter(function(route) {
        // Only return the CC'ed routes that starts with "route."
        return /^route\.(.*)$/.test(route);
      }).map(function(route) {
        // Remove the "route."
        return /^route\.(.*)$/.exec(route)[1];
      });
    }

    // Find routing key reference for this exchange, if any is available to us
    let routingKeyReference = null;
    this.bindings.forEach(binding => {
      if (binding.exchange === message.exchange && binding.routingKeyReference) {
        routingKeyReference = binding.routingKeyReference;
      }
    });

    // If we have a routing key reference we can parse the routing key
    if (routingKeyReference) {
      let i, j;
      let routing = {};
      let keys = message.routingKey.split('.');
      // first handle non-multi keys from the beginning
      for (i = 0; i < routingKeyReference.length; i++) {
        let ref = routingKeyReference[i];
        if (ref.multipleWords) {
          break;
        }
        routing[ref.name] = keys.shift();
      }
      // If we reached a multi key
      if (i < routingKeyReference.length) {
        // then handle non-multi keys from the end
        for (j = routingKeyReference.length - 1; j > i; j--) {
          let ref = routingKeyReference[j];
          if (ref.multipleWords) {
            break;
          }
          routing[ref.name] = keys.pop();
        }
        // Check that we only have one multiWord routing key
        assert(i === j, 'i != j really shouldn\'t be the case');
        routing[routingKeyReference[i].name] = keys.join('.');
      }

      // Provide parsed routing key
      message.routing = routing;
    }

    await this.handleMessage(message);
  }
}

export const consume = async (options, handleMessage, onConnected) => {
  if (handleMessage) {
    options.handleMessage = handleMessage;
  }
  if (onConnected) {
    options.onConnected = onConnected;
  }
  if (options.client.isFakeClient) {
    return options.client.makeFakeConsumer(options);
  }

  const pq = new PulseConsumer(options);
  await pq._start();
  return pq;
};
