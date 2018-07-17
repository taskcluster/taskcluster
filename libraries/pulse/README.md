# taskcluster-lib-pulse

Library for interacting with Pulse and Taskcluster-Pulse.  See [the
docs](https://docs.taskcluster.net/manual/design/apis/pulse) for more
information on Pulse.

This library is designed for use in Taskcluster services, both for producing
and consuming pulse messages.

# Usage

This library defines a Client along with several classes and functions that
base their functionality on a Client.  The Client represents an association
with a Pulse service, automatically reconnecting as necessary.

It also provides higher-level components with simplified APIs for common
applications. The higher-level components are:

* [PulseConsumer](#PulseConsumer)

If you are using one of the higher-level components, then the details of
interacting with a Client are not important -- just construct one and move on.

# Client

Create a `Client` to handle (re)connecting to Pulse:

```javascript
const pulse = require('taskcluster-lib-pulse');

const client = new pulse.Client({
  connectionString: 'amqps://...',
  monitor: .., // taskcluster-lib-monitor instance
});
// or
const client = new pulse.Client({
  username: 'sendr',
  password: 'sekrit',
  hostname: 'pulse.mycompany.com',
  vhost: '/',
  monitor: ..,
});
```

The `Client` is responsible for connecting, and re-connecting, to the pulse
server. Once created, it will do so automatically until stopped.

Other options to the constructor:

 * `recycleInterval` - interval on which connections are automatically recycled, in ms.  Default: 1 hour.
 * `retirementDelay` - time that a connection remains in the `retiring` state. Default: 30 seconds.
 * `minReconnectionInterval` - minimum time between connection attempts. Default: 15s.

## Interacting With a Client

AMQP is a very connection-oriented protocol, so as a user of this library, you
will need to set up each new connection.  To do so, set up an event listener
in a handler for the `connected` event from the client:

```javascript
client.onConnected(conn => {
  // ...
});
```

The `conn` value of this event is a `Connection` instance, from this library.
The amqplib connection is available as `conn.amqp`. The listener should create
any necessary channels, declare queues and exchanges, and - if consuming
messages - bind to those queues.

The `onConnected` method is a shorthand for `on('connected', ..)` that also
calls the handler immediately if the Client is already connected. Its return
value can be used with `client.removeListener` just like any other EventEmitter
listener.

Note that declaring non-durable queues in this method may lead to message loss
or duplication: when this connection fails, the server will delete the queues
and any pending messages.  If this is not acceptable for your application, use a
durable queue.

The library cannot detect all problems with an existing connection.  If any
method produces an error that might be fixed by reconnecting, call the
connection's `failed` method.  This will mark the connection as failed and
begin cretaing a new connection (culminating in another `connected` event).

## Active Connection

The `activeConnection` property contains the current Connection, or undefined
if no connection exists at the moment. In most cases, you will want to use
`onConnected` or `withConnection` to get access to a Client's connection,
rather than this property.

## Manipulating AMQP Objects

If you have a one-off task that requires a channel, such as declaring an
exchange, use `client.withChannel`, which will wait for a connection if
necessary, then run your asynchronous function with an amqplib channel or
confirmChannel. If the function fails, it is not automatically retried, but the
channel is closed.

```javascript
await client.withChannel(async channel => { .. }, {confirmChannel: true});
await client.withChannel(async channel => { .. }, {confirmChannel: false});
```

There is also a more general `withConnection` which returns the `Connection`
instance without creating a channel.

```javascript
await client.withConnection(async conn => { .. });
```

The most common use case for these functions is to declare or delete objects on
the AMQP server. For example:

```javascript
await client.withChannel(async chan => {
  const exchangeName = client.fullObjectName('exchange', 'notable-things');
  await chan.assertExchange(exchangeName, 'topic');
});
```

## Object Names

Note that the example above uses the `fullObjectName` method. This method will
generate an exchange name compatible with the pulse access control model, in
this case `exchanges/<namespace>/notable-things`.

This method is useful for translating unqualified names like `queueName` to the
fully qualified names required when working directly with amqplib.

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

Call the async `Client.stop()` method to shut the whole thing down. This will
wait until all existing `Connection` instances are finished their retirement.

## Examples

### Consumer

To consume messages, listen for `connected` messages and set up a new
channel on each new connection.  Stop consuming from the channel on retirement,
allowing time for any in-flight consumption to complete before the connection
is finished.

The whole thing is wrapped in a try/catch so that any errors in connection
setup are treated as a connection failure.

**NOTE**: the `PulseConsumer` class implements a full-featured consumer; this
code is provided merely as an example of Client usage.

```javascript
client.on('connected', async (conn) => {
  let channel, consumer;

  try {
    const amqp = conn.amqp;
    channel = await amqp.createChannel();
    await channel.assertExchange(exchangeName, 'topic');
    await channel.assertQueue(queueName);
    await channel.bindQueue(queueName, exchangeName, routingKeyPattern);

    consumer = await channel.consume(queueName, (msg) => {
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
```

## Fakes for Testing

The `FakeClient` class can be used instead of `Client` in testing situations,
to avoid the need for an actual AMQP server.  The class itself has no
functionality, but serves as a semaphore to activate a "fake" mode when passed
to higher-level components such as `PulseConsumer`: `fakeConsumer =
consume({client: new FakeClient(), ..})`.

# PulseConsumer

A PulseConsumer declares a queue and listens for messages on that queue,
invoking a callback for each message.

Construct a PulseConsumer with the async `consume` function:

```javascript
const pulse = require('taskcluster-lib-pulse');
let pc = await pulse.consume({
  client,                // Client object for connecting to the server
  bindings: [{           // exchange/routingKey patterns to bind to
    exchange,            // Exchange to bind
    routingKeyPattern,   // Routing key as string
    routingKeyReference, // Reference used to parse routing keys (optional)
  }, ..],
  queueName,             // Queue name (without `queues/<namespace>/` prefix)
  prefetch,              // Max number of messages unacknowledged to hold (optional)
  maxLength,             // Maximum queue size, undefined for none
  ...queueOptions,       // passed to assertQueue
}, async ({payload, exchange, routingKey, redelivered, routes, routing}) => {
  // handle message
  ...
});
```

This will create a queue using a pulse-compatible queue name based on
`queueName` (prefixed with `queue/<namespace>`).

If `routingKeyReference` is provided for the exchange from which messages
arrive, then the listener will parse the routing key and make it available as a
dictionary on the message.  Note that bindings are easily constructed using the
taskcluster-client library.

The instance starts consuming messages immediately. When the `consume` function's
promise has resolved, the queue exists and all bindings are in place.
At this time, it is safe to initiate any actions that might generate messages
you wish to receive.

Call `await pc.stop()` to stop consuming messages.  A PulseConsumer cannot be
restarted after stopping -- instead, create a new instance.  The `stop`
method's Promise will not resolve until all message-handling has completed and
the channel is closed.

When a message is received, the message handler (second positional argument) is
called (asynchronously) with a message of the form:

```javascript
{
  payload,       // parsed payload (as JSON)
  exchange,      // exchange name
  routingKey:    // primary routing key
  redelivered:   // true if this message has already been attempted
  routes: [..]   // additional routes (from CC header, with the `route.`
                 // prefix stripped)
  routing: {}    // parsed routes (if routingKeyReference is provided)
}
```

If the handler fails, the message will be re-queued and re-tried once.

## Routing Key Reference

A binding's `routingKeyReference` gives reference information for the format of
a routing key, and allows the tool to "parse" a message's routing key into
components.  It is an array of objects with properties `name`, the name of the
component, and `multipleWords` if the component can match multiple words
(joined with a `.`).  Other fields are ignored.  Only one component can have
`multipleWords`.  This is compatible with the references produced by
taskcluster services.

```javascript
routingKeyReference: [
  {name: 'routingKeyKind'},
  {name: 'someId', multipleWords: true},
]
```

If this parameter is given, the message will have a `routing` property
containing the routing key components keyed by their name.

The library assumes that all messages on a given exchange share the same
routing key reference, as it is not practical to determine which
routingKeyPattern matched a particular message.

## Modifying Bindings

In some cases, it is necessary to modify the bindings for a queue while it is
still consuming.  Use `queue.withChannel` (above) for this purpose. In this
case, it is simplest to provide an empty `bindings: []` to the PulseConsumer
constructor and manage bindings entirely via `withChannel`. Note that with this
arrangement, routing key reference is not supported.

## Fake Mode

If passed a `FakeClient`, `consume` will return a fake consumer.  That object
does not interface with an AMQP server, but has an async `fakeMessage` method
which will call back the message-handling function with the same arguments.

```javascript
const consumer = consume({
  client: new FakeClient(),
  ...
}, async ({payload, exchange, routingKey, redelivered, routes, routing}) => {
  // ...
});
await consumer.fakeMessage({payload: .., exchange: .., ..});
```

# Testing

To run the tests, a simple `yarn test` will do.  But it will skip most of the tests!

Better to run against a real RabbitAMQP server.  If you have Docker, that's easy:

```
docker run -d -ti --rm -p 5672:5672 rabbitmq:alpine
export PULSE_CONNECTION_STRING=amqp://guest:guest@localhost:5672/
```
