# AMQP Workers

[![Build Status](https://travis-ci.org/lightsofapollo/amqpworkers.png)](https://travis-ci.org/lightsofapollo/amqpworkers)

AMQP Workers is an opinioned library which codifies a lot of my personal
tastes while working with AMQP in JavaScript (node). It also embraces a
Promise _only_ api (everything should return a promise) and requires you
to setup / manage your own amqp connection (through [amqplib](https://npmjs.org/package/amqplib)).

The primary export is build out of four smaller modules (and while you
can use the top level export using the longer form is probably what you
want).

- [Schema](#schema)
- [Consumer](#consumer)
- [Message](#message)
- [Publisher](#publisher)


## Schema

A "Schema" is a blueprint to build all queues, exchanges and bindings
between them. Generally you always need to define a schema and its a
good idea to try to build it before publishing new messages or consuming
a queue. 

```js

// your_schema.js

var Schema = require('amqpworkers/schema');

module.exports = new Schema({
  // see examples/schema_config.json
});

```

Now that the schema is defined we can use it to define, purge and
destroy it. In RabbitMQ 3.2 and greater all are idempotent but deletes
will fail if the queue/exchange does not exist in earlier versions.

```js
// Define the schema

var AMQPSchema = require('./my_schema');

// this is the result from amqplib.connect
var connection;

AMQPSchema.define(connection).then(
 //
);

// Destroy the schema (delete queues and exchanges)

AMQPSchema.destroy(connection).then(
 // messages and queues are gone! Good for testing
);

// Purge the messages but leave the exchanges, queues and bindings alone

AMQPSchema.purge(connection).then(
 // messages and queues are gone! Good for testing
);
```

## Consumer

A consumer is an object oriented approach to consuming queues. They can
be used directly by instantiating Consumer or via inheritance.

```js
var Consumer = require('amqpworkers/consumer');

// this is the result from amqplib.connect
var connection;

var consumer = new Consumer(queue);

// Read will be called when an item is being consumed from the queue.
consumer.read = function(content, message) {
  // content is the parsed content of the message
  // and message is un mutated value from amqplib


  // the promise is optional but highly recommended if you care about
  // ack / nack. When this promise is accepted an ack will be sent
  // (and you guessed! nack when rejected).
  return new Promise(function(accept, reject) {

  });
}
consumer.consume('the queue name', {
  // optional prefetch option
  prefetch: 1
});

// cleanup when your done
consumer.close();
```

The consumer has the `parseMessage` method which will be called prior
to passing the result of that function and the message along to the
.read method. This can be used as a hook for implementing other
de-serializing protocols.

## Message

A message is a simple representation of an _outbound_ (to be published)
message.

Messages are simply any object with a `.buffer [Buffer]` property and an `.options [Object]` property.
The provided object will parse objects into json blobs
`(new Buffer(JSON.stringify(obj))` and stamp them with `contentType`
`application/json`

```js
var Message = require('amqp/message');

var myMsg = new Message(
  // will be converted into a buffer
  { woot: true },

  // see amqplib #publish options
  { persistent: true }
);

// json blob
myMsg.buffer;

// application/json
myMsg.options.contentType;
```

Messages are only useful in conjunction with [Publishers](#publisher)
`#publish` method.

## Publisher

Publishers are fairly simple wrappers around #publish and confirm
channels. The assumption is that every message is critical and slowing
down the publishing process to confirm writes is more important then
raw speed.

```js
var Publisher = require('amqpworker/publisher'),
    Message = require('amqpworker/message');

// from amqplib #connect
var connection;

var tasks = new Publisher(connection);

// publish something to the task exchange

tasks.publish(
  'tasks', // exchange name
  'request', // routing key
  new Message({ woot: true }, { persistent: true })
).then(
  function() {
    // confirmed  
  },
  function() {
    // rejected
  }
);

// cleanup when your done
tasks.close();
```
