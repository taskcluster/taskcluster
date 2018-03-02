# taskcluster-lib-pulse

Library for interacting with Pulse and Taskcluster-Pulse

# Usage

## Constructor

Create a `Client` to handle (re)connecting to Pulse:

```javascript
const pulse = require('taskcluster-lib-pulse');

const client = new pulse.Client({
  connectionString: 'amqps://...',
});
// or
const client = new pulse.Client({
  username: 'sendr',
  password: 'sekrit',
  hostname: 'pulse.mycompany.com',
});
```

The `Client` is responsible for connecting, and re-connecting, to the pulse
server. Once started, it will do so automatically until stopped.

Other options to the constructor:

 * `recycleInterval` - interval on which connections are automatically recycled, in ms.  Default: 1 hour.
 * `retirementDelay` - time that a connection remains in the `retiring` state.

## Connection Setup

AMQP is a very connection-oriented protocol, so as a user of this library, you
will need to set up each new connection.  To do so, set up an event listener
for the `connected` event from the client:

```javascript
client.on('connected', conn => {
  // ...
});
```

The `conn` value of this event is a `Connection` instance, from this library.
The amqplib connection is available as `conn.amqp`. The listener should create
any necessary channels, declare queues and exchanges, and - if consuming
messages - bind to those queues.

Note that declaring non-durable queues in this method may lead to message loss
or duplication: when this connection fails, the server will delete the queues
and any pending tasks.  If this is not acceptable for your application, use a
durable queue.

The library cannot detect all problems with an existing connection.  If any
method produces an error that might be fixed by reconnecting, call the
connection's `failed` method.  This will mark the connection as failed and
begin cretaing a new connection (culminating in another `connected` event).

## Reconnection

The `Client` instance will automatically reconnect periodically. This helps
to distribute load across a cluster of servers, and also exerciess the
reconnection logic in the application, avoiding nasty surprises when a network
or server failure occurs.

The `Client` also has a `recycle` method that will trigger a retirement and
reconnection.

## Retirement

When a connection is still working, but a new connection is being created, the
old connection spends 30 seconds "retiring". The intent of this delay is to
allow any ongoing message handling to complete before closing the underlying
AMQP connection.

The `Connection` instance emits a `retiring` event when retirement begins.
Consumers should respond to this message by cancelling any channel consumers.
The `retiring` event from the `Connection` will be followed by a
`connected` event from the `Client` for the next connection.

## Shutdown

Call the async `Client.stop` method to shut the whole thing down. This will
wait until all existing `Connection` instances are finished their retirement.

# Examples

## Consumer

To consume messages, listen for `connected` messages and set up a new
channel on each new connection.  Stop consuming from the channel on retirement,
allowing time for any in-flight consumption to complete before the connection
is finished.

The whole thing is wrapped in a try/catch so that any errors in connection
setup are treated as a connection failure.


```javascript
client.on('connected', async (conn) => {
  let channel, consumer;

  try {
    const amqp = conn.amqp;
    channel = await amqp.createChannel();
    await channel.assertExchange(exchangeName, 'topic');
    await channel.assertQueue(queueName);
    await channel.bindQueue(queueName, exchangeName, routingKeyPattern);

    consumer = channel.consume(queueName, (msg) => {
      // do something with the message, then ack it..
      channel.ack(msg);
    });

    conn.on('retiring', () => {
      // ignore errors in this call: the connection is already retiring..
      channel.cancel(consumer.consumerTag).catch(() => {});
    });
  } catch (err) {
    debug('error in connected listener: %s', err);
    conn.failed();
  }
});

client.start();
```

# Testing

To run the tests, a simple `yarn test` will do.  But it will skip most of the tests!

Better to run against a real RabbitAMQP server.  If you have Docker, that's easy:

```
docker run -d -ti --rm -p 5672:5672 rabbitmq:alpine
export PULSE_CONNECTION_STRING=amqp://guest:guest@localhost:5672/
```
