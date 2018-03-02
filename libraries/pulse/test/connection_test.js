const lib = require('../src');
const amqplib = require('amqplib');
const assert = require('assert');
const assume = require('assume');
const debugModule = require('debug');

const PULSE_CONNECTION_STRING = process.env.PULSE_CONNECTION_STRING;

if (!PULSE_CONNECTION_STRING) {
  console.log('WARNING: $PULSE_CONNECTION_STRING is not set; skipping tests that require an active server');
  console.log('see README.md for details');
}

suite('buildConnectionString', function() {
  test('missing arguments are an error', function() {
    assume(() => lib.buildConnectionString({username: 'me', password: 'pw'}))
      .throws(/hostname/);
    assume(() => lib.buildConnectionString({username: 'me', hostname: 'h'}))
      .throws(/password/);
    assume(() => lib.buildConnectionString({password: 'pw', hostname: 'h'}))
      .throws(/username/);
  });

  test('builds a connection string with given host', function() {
    assert.equal(
      lib.buildConnectionString({
        username: 'me',
        password: 'letmein',
        hostname: 'pulse.abc.com',
      }),
      'amqps://me:letmein@pulse.abc.com:5671');
  });

  test('builds a connection string with urlencoded values', function() {
    assert.equal(
      lib.buildConnectionString({
        username: 'ali-escaper:/@\\|()<>&',
        password: 'bobby-tables:/@\\|()<>&',
        hostname: 'pulse.abc.com',
      }),
      'amqps://ali-escaper:/@%5C%7C()%3C%3E&:bobby-tables:/@%5C%7C()%3C%3E&@pulse.abc.com:5671');
  });
});

const connectionTests = connectionString => {
  let client;

  // use a unique name for each test run, just to ensure nothing interferes
  const unique = new Date().getTime().toString();
  const exchangeName = `exchanges/test/${unique}`;
  const queueName = `queues/test/${unique}`;
  const routingKey = 'greetings';
  const message = new Buffer('Hello');
  const debug = debugModule('test');

  setup(function() {
    client = new lib.Client({
      connectionString,
      retirementDelay: 50,
    });
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

  test('start and immediately stop', async function() {
    let gotConnection = false;
    client.on('connected', () => { gotConnection = true; });
    client.start();
    await client.stop();
    assume(gotConnection).to.equal(false);
  });

  test('reconnect interval', async function() {
    let client = new lib.Client({
      connectionString,
      recycleInterval: 10,
    });

    let recycles = 0;
    client.recycle = () => { recycles++; };
    client.start();
    await new Promise(resolve => setTimeout(resolve, 100));
    await client.stop();
    assume(recycles).is.gt(5);
  });

  test('start and stop after connection is established', async function() {
    await new Promise((resolve, reject) => {
      client.on('connected', () => {
        client.stop().then(resolve, reject);
      });
      client.start();
    });
  });

  test('start, fail, and then stop', async function() {
    await new Promise((resolve, reject) => {
      client.once('connected', connection => {
        connection.failed();
        client.once('connected', () => {
          client.stop().then(resolve, reject);
        });
      });
      client.start();
    });
  });

  test('consumer (with failures)', async function() {
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
              return;
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
        client.start();
      });

      assume(messageReceived).to.equal(1);
    } finally {
      await client.stop();
    }
  });
};

suite('Client', function() {
  suite('constructor', function() {
    test('rejects connectionString *and* username', function() {
      assume(() => new lib.Client({username: 'me', connectionString: 'amqps://..'}))
        .throws(/along with/);
    });
    test('requires either connectionString *or* username', function() {
      assume(() => new lib.Client({}))
        .throws(/is required/);
    });
  });

  suite('with RabbitMQ', function() {
    suiteSetup(function() {
      if (!PULSE_CONNECTION_STRING) {
        this.skip();
      }
    });

    connectionTests(PULSE_CONNECTION_STRING);
  });
});
