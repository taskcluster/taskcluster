const { Client, connectionStringCredentials } = require('../src');
const { Connection } = require('../src/client');
const amqplib = require('amqplib');
const assume = require('assume');
const debugModule = require('debug');
const slugid = require('slugid');
const helper = require('./helper');
const { suiteName } = require('taskcluster-lib-testing');

helper.secrets.mockSuite(suiteName(), ['pulse'], function(mock, skipping) {
  if (mock) {
    return; // Only test with real creds
  }
  let connectionString;

  // use a unique name for each test run, just to ensure nothing interferes
  const unique = new Date().getTime().toString();
  const exchangeName = `exchanges/test/${unique}`;
  const queueName = `queues/test/${unique}`;
  const routingKey = 'greetings';
  const message = Buffer.from('Hello');
  const debug = debugModule('test');
  const monitor = helper.monitor;

  setup(async function() {
    connectionString = helper.secrets.get('pulse').connectionString;
  });

  // publish a message to the exchange using just amqplib, declaring the
  // exchange in the process
  const publishMessage = async () => {
    const conn = await amqplib.connect(connectionString);
    const chan = await conn.createChannel();
    await chan.assertExchange(exchangeName, 'topic');
    // declare and bind the queue, too, since the consumer has probably
    // not started up yet
    await chan.assertQueue(queueName);
    await chan.bindQueue(queueName, exchangeName, '#');

    debug('publishing fake message to exchange %s', exchangeName);
    await chan.publish(exchangeName, routingKey, message);
    await chan.close();
    await conn.close();
    debug('publish complete');
  };

  const credentials = connectionStringCredentials(connectionString);

  test('start and immediately stop', async function() {
    let gotConnection = false;
    const client = new Client({
      credentials,
      retirementDelay: 50,
      minReconnectionInterval: 20,
      monitor,
      namespace: 'guest',
    });
    client.on('connected', () => { gotConnection = true; });
    await client.stop();
    assume(gotConnection).to.equal(false);
  });

  test('activeConnection', async function() {
    const client = new Client({
      credentials,
      retirementDelay: 50,
      minReconnectionInterval: 20,
      monitor,
      namespace: 'guest',
    });
    assume(client.activeConnection).to.equal(undefined);
    await new Promise((resolve, reject) => {
      client.on('connected', conn => {
        try {
          assume(client.activeConnection).to.equal(conn);
        } catch (err) {
          return reject(err);
        }
        resolve();
      });
    });
    await client.stop();
    assume(client.activeConnection).to.equal(undefined);
  });

  test('recycle interval', async function() {
    let recycles = 0;
    const client = new Client({
      credentials,
      recycleInterval: 5,
      retirementDelay: 50,
      monitor,
      namespace: 'guest',
    });

    // simplify _startConnection to the important part for this test:
    // updating the timer (and counting calls)
    client._startConnection = () => {
      recycles++;
      return new Connection(50);
    };

    await new Promise(resolve => setTimeout(resolve, 200));
    await client.stop();
    assume(recycles).is.gt(5);
  });

  test('minReconnectionInterval', async function() {
    let connections = 0;
    const oldConnect = amqplib.connect;
    amqplib.connect = async () => {
      connections++;
      throw new Error('uhoh');
    };

    const client = new Client({
      credentials,
      retirementDelay: 50,
      minReconnectionInterval: 10,
      monitor,
      namespace: 'guest',
    });

    try {
      // Run the Client for 100ms.  At 10ms per connection, wes should get about 10
      // connections; if the minReconnectionInterval doesn't work, we'll get a lot
      // more than that!
      await new Promise(resolve => setTimeout(resolve, 100));
      await client.stop();
    } finally {
      amqplib.connect = oldConnect;
    }
    assume(connections).is.between(5, 15);
  });

  test('start and stop after connection is established', async function() {
    const client = new Client({
      credentials,
      retirementDelay: 50,
      minReconnectionInterval: 20,
      monitor,
      namespace: 'guest',
    });

    await new Promise((resolve, reject) => {
      client.onConnected(() => {
        client.stop().then(resolve, reject);
      });
    });
  });

  test('start, fail, and then stop', async function() {
    const client = new Client({
      credentials,
      retirementDelay: 50,
      minReconnectionInterval: 20,
      monitor,
      namespace: 'guest',
    });

    await new Promise((resolve, reject) => {
      client.once('connected', connection => {
        connection.failed();
        client.once('connected', () => {
          client.stop().then(resolve, reject);
        });
      });
    });
  });

  test('withConnection', async function() {
    const client = new Client({
      credentials,
      retirementDelay: 50,
      minReconnectionInterval: 20,
      monitor,
      namespace: 'guest',
    });

    let gotConnection = false;
    let finishedWithConnection = false;
    client.withConnection(conn => { gotConnection = true; })
      .then(() => { finishedWithConnection = true; });

    assume(finishedWithConnection).to.equal(false);
    await new Promise((resolve, reject) => {
      client.once('connected', () => {
        client.stop().then(resolve, reject);
      });
    });

    // check that the withConnection function was called, and that its
    // promise is resolved.
    assume([gotConnection, finishedWithConnection]).to.eqls([true, true]);
  });

  suite('withChannel', function() {
    let client;

    setup(function() {
      if (skipping()) {
        return;
      }

      client = new Client({
        credentials,
        retirementDelay: 50,
        minReconnectionInterval: 20,
        monitor,
        namespace: 'guest',
      });
    });

    teardown(async function() {
      if (skipping()) {
        return;
      }

      await client.stop();
    });

    test('asserting a queue', async function() {
      const queueName = client.fullObjectName('queue', slugid.v4());

      await client.withChannel(async chan => {
        await chan.assertQueue(queueName);
      });

      let queueInfo;
      await client.withChannel(async chan => {
        queueInfo = await chan.checkQueue(queueName);
        await chan.deleteQueue(queueName);
      });

      assume(queueInfo.queue).to.equal(queueName);
    });

    test('with an error', async function() {
      const queueName = client.fullObjectName('queue', slugid.v4());

      let gotException;
      try {
        await client.withChannel(async chan => {
          // throw an error to exercise error-handling code
          throw new Error('uhoh');
        });
      } catch (err) {
        if (/uhoh/.test(err)) {
          // note that we can't tell if the channel was closed properly
          gotException = true;
        } else {
          throw err;
        }
      }
      assume(gotException).to.equal(true);

      // clean up..
      await client.withChannel(async chan => {
        await chan.deleteQueue(queueName);
      });

      // check that it did not kill the connection
      assume(client.connections.length).to.equal(1);
    });

    test('binding nonexistent exchange', async function() {
      const queueName = client.fullObjectName('queue', slugid.v4());

      await client.withChannel(async chan => {
        await chan.assertQueue(queueName);
      });

      let err;
      try {
        await client.withChannel(async chan => {
          await chan.bindQueue(queueName, 'nosuchexchange', '#');
        });
      } catch (e) {
        err = e;
      }
      assume(err.code).to.equal(404);

      // clean up..
      await client.withChannel(async chan => {
        await chan.deleteQueue(queueName);
      });

      // check that it did not kill the connection
      assume(client.connections.length).to.equal(1);
    });
  });

  test('consumer (with failures)', async function() {
    const client = new Client({
      credentials,
      retirementDelay: 50,
      minReconnectionInterval: 20,
      monitor,
      namespace: 'guest',
    });

    let failureCount = 0;
    let messageReceived = 0;

    try {

      await new Promise((resolve, reject) => {
        client.on('connected', async (conn) => {
          let chan, consumer;

          // do the per-connection setup we expect a user to do
          try {
            const amqp = conn.amqp;
            chan = await amqp.createChannel();
            await chan.assertExchange(exchangeName, 'topic');
            await chan.assertQueue(queueName);
            await chan.bindQueue(queueName, exchangeName, '#');

            // simulate a failure..
            if (++failureCount < 3) {
              debug('fake failure number %s', failureCount);
              throw new Error('uhoh');
            }

            consumer = chan.consume(queueName, (msg) => {
              try {
                assume(msg.content).to.deeply.equal(message);
                messageReceived++;
                chan.ack(msg);
              } catch (err) {
                return reject(err);
              }
              resolve();
            });

            conn.on('retiring', () => {
              chan.cancel(consumer.consumerTag).catch(reject);
            });
          } catch (err) {
            debug('error in connected listener: %s', err);
            conn.failed();
          }
        });

        // start publishing the message
        publishMessage().catch(reject);
      });

      assume(messageReceived).to.equal(1);
    } finally {
      await client.stop();
    }
  });
});
