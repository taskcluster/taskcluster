const {Client, consume, connectionStringCredentials} = require('../src');
const amqplib = require('amqplib');
const assume = require('assume');
const fs = require('fs');
const debugModule = require('debug');
const assert = require('assert');
const helper = require('./helper');
const {suiteName} = require('taskcluster-lib-testing');

helper.secrets.mockSuite(suiteName(), ['pulse'], function(mock, skipping) {
  if (mock) {
    return; // Only test with real creds
  }
  let connectionString;
  const monitor = helper.monitor;

  setup(async function() {
    connectionString = helper.secrets.get('pulse').connectionString;
  });

  suite('PulseConsumer', function() {
    // use a unique name for each test run, just to ensure nothing interferes
    const unique = new Date().getTime().toString();
    const exchangeName = `exchanges/test/${unique}`;
    const routingKey = 'greetings.earthling.foo.bar.bing';
    const routingKeyReference = [
      {name: 'verb'},
      {name: 'object'},
      {name: 'remainder', multipleWords: true},
    ];
    const debug = debugModule('test');

    suiteSetup(async function() {

      // otherwise, set up the exchange
      const conn = await amqplib.connect(connectionString);
      const chan = await conn.createChannel();
      await chan.assertExchange(exchangeName, 'topic');
      await chan.close();
      await conn.close();
    });

    const publishMessages = async () => {
      const conn = await amqplib.connect(connectionString);
      const chan = await conn.createChannel();

      for (let i = 0; i < 10; i++) {
        const message = Buffer.from(JSON.stringify({data: 'Hello', i}));
        debug(`publishing fake message ${i} to exchange ${exchangeName}`);
        await chan.publish(exchangeName, routingKey, message);
      }

      await chan.close();
      await conn.close();
    };

    // publish messages and wait until the pq stops
    const publishUntilStopped = pq => {
      return new Promise((resolve, reject) => {
        pq._stoppedCallback = resolve;
        publishMessages().catch(reject);
      });
    };

    test('consume messages', async function() {
      const client = new Client({
        credentials: connectionStringCredentials(connectionString),
        retirementDelay: 50,
        minReconnectionInterval: 20,
        monitor,
        namespace: 'guest',
      });
      const got = [];

      const pq = await consume({
        client,
        queueName: unique,
        bindings: [{
          exchange: exchangeName,
          routingKeyPattern: '#',
          routingKeyReference,
        }],
        prefetch: 2,
      }, async message => {
        debug(`handling message ${message.payload.i}`);
        // message three gets retried once and then discarded.
        if (message.payload.i === 3) {
          // inject an error to test retrying
          throw new Error('uhoh');
        }

        // recycle the client after we've had a few messages, just for exercise.
        // Note that we continue to process this message here
        if (got.length === 4) {
          client.recycle();
        }
        got.push(message);
        if (got.length === 9) {
          // stop the pq, but don't wait for its Promise to resolve; this exercises
          // the code that waits for message handling to finish before closing.  If
          // there is an issue, Mocha will catch the unhandled rejection.
          pq.stop();
        }
      });

      await publishUntilStopped(pq);

      await client.stop();

      got.forEach(msg => {
        assume(msg.payload.data).to.deeply.equal('Hello');
        assume(msg.exchange).to.equal(exchangeName);
        assume(msg.routingKey).to.equal(routingKey);
        assume(msg.routing).to.deeply.equal({
          verb: 'greetings',
          object: 'earthling',
          remainder: 'foo.bar.bing',
        });
        // note that we ignore redelivered: some of these may be redelivered
        // when the connection is recycled..
        assume(msg.routes).to.deeply.equal([]);
      });

      const numbers = got.map(msg => msg.payload.i);
      numbers.sort(); // with prefetch, order is not guaranteed
      assume(numbers).to.deeply.equal([0, 1, 2, 4, 5, 6, 7, 8, 9]);

      // check that we logged the 'uhoh' error
      const errors = monitor.manager.messages
        .filter(({Fields: {message}}) => message === 'uhoh');
      assert.equal(errors.length, 1);
      monitor.manager.messages = [];
    });

    test('handle connection failure during consumption', async function() {
      const client = new Client({
        credentials: connectionStringCredentials(connectionString),
        retirementDelay: 50,
        minReconnectionInterval: 20,
        monitor,
        namespace: 'guest',
      });
      const got = [];

      const pq = await consume({
        client,
        queueName: unique,
        bindings: [{
          exchange: exchangeName,
          routingKeyPattern: '#',
          routingKeyReference,
        }],
        prefetch: 1,
      }, async message => {
        debug(`handling message ${message.payload.i}`);

        // Foricibly kill the connection after the first message
        if (got.length === 1) {
          // This is not pretty, but works for now.  If this breaks, try to find
          // another way to access the file descriptor for a socket.
          const fd = client.connections[0].amqp.connection.stream._handle.fd;
          debug(`closing pulse socket, file descriptor ${fd}`);
          fs.closeSync(fd);
        }

        got.push(message);
        if (got.length === 11) {
          pq.stop();
        }
      });

      await publishUntilStopped(pq);

      await client.stop();

      const numbers = got.map(msg => msg.payload.i);
      numbers.sort(); // order is not guaranteed
      assume(numbers).to.deeply.equal([0, 1, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    test('consume messages ephemerally', async function() {
      const client = new Client({
        credentials: connectionStringCredentials(connectionString),
        retirementDelay: 50,
        minReconnectionInterval: 20,
        monitor,
        namespace: 'guest',
      });
      const got = [];

      const pq = await consume({
        ephemeral: true,
        client,
        bindings: [{
          exchange: exchangeName,
          routingKeyPattern: '#',
          routingKeyReference,
        }],
        prefetch: 1,
        onConnected: async () => {
          debug('onConnected');
          got.push({connected: true});
          // if this is the second reconnection, then we're done -- no further
          // messages are expected, as they were lost when we reconnected
          if (got.filter(x => x.connected).length === 2) {
            // stop the PulseConsumer in a tenth-second, to exercise that code
            // (this isn't how pq.stop would normally be called!). The delay
            // is to allow any further message deliveries (but we expect none)
            setTimeout(() => pq.stop(), 100);
          }
        },
        handleMessage: async message => {
          debug(`handling message ${message.payload.i}`);
          // message three gets retried once and then discarded.
          if (message.payload.i === 3) {
            // inject an error to test retrying
            debug(`throwing error`);
            throw new Error('uhoh');
          }

          // recycle the client after we've had a few messages, just for exercise.
          // Note that we continue to process this message here.  We will lose any
          // remaining messages ("ephemeral", right?), so onConnected will resolve
          // the promise once this occurs.
          if (got.length === 4) {
            client.recycle();
          }
          got.push(message);
        },
      });

      await publishUntilStopped(pq);

      await client.stop();

      got.forEach(msg => {
        if (msg.connected) {
          return;
        }
        assume(msg.payload.data).to.deeply.equal('Hello');
        assume(msg.exchange).to.equal(exchangeName);
        assume(msg.routingKey).to.equal(routingKey);
        assume(msg.routing).to.deeply.equal({
          verb: 'greetings',
          object: 'earthling',
          remainder: 'foo.bar.bing',
        });
        // note that we ignore redelivered: some of these may be redelivered
        // when the connection is recycled..
        assume(msg.routes).to.deeply.equal([]);
      });

      const numbers = got.map(msg => msg.connected ? 'connected' : 'msg');
      // note that order is not guaranteed here, so just assert that we connected, got
      // four messages, reconnected, and then saw nothing.
      assume(numbers).to.deeply.equal(['connected', 'msg', 'msg', 'msg', 'msg', 'connected']);

      // check that we logged the 'uhoh' error
      const errors = monitor.manager.messages
        .filter(({Fields: {message}}) => message === 'uhoh');
      assert.equal(errors.length, 1);
      monitor.manager.messages = [];
    });

    test('no queueuName is an error', async function() {
      const client = new Client({
        credentials: connectionStringCredentials(connectionString),
        retirementDelay: 50,
        minReconnectionInterval: 20,
        monitor,
        namespace: 'guest',
      });

      try {
        await consume({client, bindings: []}, () => {});
      } catch (err) {
        assume(err).to.match(/Must pass a queueName/);
        await client.stop();
        return;
      }
      assert(false, 'Did not get expected error');
    });
  });
});
