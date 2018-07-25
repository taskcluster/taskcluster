const {FakeClient, Client, Exchanges} = require('../src');
const path = require('path');
const amqplib = require('amqplib');
const assume = require('assume');
const assert = require('assert');
const libMonitor = require('taskcluster-lib-monitor');
const SchemaSet = require('taskcluster-lib-validate');
const libUrls = require('taskcluster-lib-urls');
const libTesting = require('taskcluster-lib-testing');

const PULSE_CONNECTION_STRING = process.env.PULSE_CONNECTION_STRING;

suite('publisher_test.js', function() {
  const exchangeOptions = {
    serviceName: 'lib-pulse',
    projectName: 'taskcluster-lib-pulse',
    version: 'v2',
    title: 'tc-lib-pulse tests',
    description: 'testing stuff',
  };

  const declaration = {
    exchange: 'egg-hatched',
    name: 'eggHatched',
    title: 'Egg Hatched',
    description: 'an egg hatched',
    schema: 'egg-hatched-message.yml',
    routingKey: [{
      name:           'eggId',
      summary:        'Identifier that we use for testing',
      multipleWords:  false,
      required:       true,
      maxSize:        22,
    }],
    messageBuilder: msg => msg,
    routingKeyBuilder: msg => msg,
    CCBuilder: msg => [],
  };

  suite('Exchanges', function() {
    test('constructor args required', function() {
      assume(() => new Exchanges({})).to.throw(/is required/);
    });

    test('declare args required', function() {
      const exchanges = new Exchanges(exchangeOptions);
      assume(() => exchanges.declare({})).to.throw(/is required/);
    });

    test('declare routing key args required', function() {
      const exchanges = new Exchanges(exchangeOptions);
      assume(() => exchanges.declare({...declaration, routingKey: [{}]}))
        .to.throw(/is required/);
    });

    test('declare routing key too long fails', function() {
      const exchanges = new Exchanges(exchangeOptions);
      const routingKey = [
        {
          name:           'testId',
          summary:        'Identifier that we use for testing',
          multipleWords:  false,
          required:       true,
          maxSize:        22,
        }, {
          name:           'taskRoutingKey',
          summary:        'Test specific routing-key: `test.key`',
          multipleWords:  true,
          required:       true,
          maxSize:        128,
        }, {
          name:           'state',
          summary:        'State of something',
          multipleWords:  false,
          required:       false,
          maxSize:        128,
        },
      ];
      assume(() => exchanges.declare({...declaration, routingKey}))
        .to.throw(/cannot be larger than/);
    });

    test('declaration with same name fails', function() {
      const exchanges = new Exchanges(exchangeOptions);
      exchanges.declare({...declaration, name: 'x', exchange: 'xx'});
      assume(() => exchanges.declare({...declaration, name: 'x', exchange: 'yy'}))
        .to.throw(/already declared/);
    });

    test('declaration with same exchange fails', function() {
      const exchanges = new Exchanges(exchangeOptions);
      exchanges.declare({...declaration, name: 'x', exchange: 'xx'});
      assume(() => exchanges.declare({...declaration, name: 'y', exchange: 'xx'}))
        .to.throw(/already declared/);
    });

    test('sucessful declaration', function() {
      const exchanges = new Exchanges(exchangeOptions);
      exchanges.declare(declaration);
      // doesn't throw anything..
    });

    test('reference is correct', function() {
      const exchanges = new Exchanges(exchangeOptions);
      exchanges.declare(declaration);
      assume(exchanges.reference()).to.deeply.equal({
        $schema: 'http://schemas.taskcluster.net/base/v1/exchanges-reference.json#',
        version: 0,
        exchangePrefix: 'exchange/taskcluster-lib-pulse/v2/',
        serviceName: 'lib-pulse',
        title: 'tc-lib-pulse tests',
        description: 'testing stuff',
        entries: [{
          description: 'an egg hatched',
          exchange: 'egg-hatched',
          name: 'eggHatched',
          routingKey: [{
            constant: false,
            multipleWords: false,
            name: 'eggId',
            required: true,
            summary: 'Identifier that we use for testing',
          }],
          schema: 'v2/egg-hatched-message.json#',
          title: 'Egg Hatched',
          type: 'topic-exchange',
        }],
      });
    });
  });

  suite('PulsePublisher', function() {
    // use a unique name for each test run, just to ensure nothing interferes
    const unique = `test-${new Date().getTime()}`;
    let client, conn, chan, exchanges, schemaset, publisher, messages;

    suiteSetup(async function() {
      if (!PULSE_CONNECTION_STRING) {
        this.skip();
        return;
      }

      const monitor = await libMonitor({projectName: exchangeOptions.projectName, mock: true});
      client = new Client({
        connectionString: PULSE_CONNECTION_STRING,
        retirementDelay: 50,
        minReconnectionInterval: 20,
        monitor,
      });
      // this won't be necessary when namespace is a proper argument to the
      // Client class..
      client.namespace = exchangeOptions.projectName;

      exchanges = new Exchanges(exchangeOptions);
      exchanges.declare({...declaration, exchange: unique});

      schemaset = new SchemaSet({
        serviceName: exchangeOptions.serviceName,
        folder: path.join(__dirname, 'schemas'),
      });

      publisher = await exchanges.publisher({
        rootUrl: libUrls.testRootUrl(),
        schemaset,
        client,
      });

      // otherwise, set up a queue to listen for messages, using amqplib
      // directly to avoid assuming the test subject works
      conn = await amqplib.connect(PULSE_CONNECTION_STRING);
      chan = await conn.createChannel();
      const queueName = `queue/${client.namespace}/${unique}`;
      await chan.assertQueue(queueName, 'topic', {
        exclusive: true,
        durable: false,
        autodelete: true,
      });

      const exchangeName = `exchange/${client.namespace}/v2/${unique}`;
      await chan.bindQueue(queueName, exchangeName, '#');
      await chan.consume(queueName, msg => {
        messages.push(msg);
        chan.ack(msg);
      });
    });

    setup(function() {
      messages = [];
    });

    test('invalid message fails', async function() {
      await assume(publisher.eggHatched({bogusThing: 'uhoh'}))
        .rejects();
    });

    test('message with too-long routingKey fails', async function() {
      await assume(publisher.eggHatched({eggId: 'uhoh! '.repeat(100)}))
        .rejects();
    });

    test('publish a message', async function() {
      await publisher.eggHatched({eggId: 'yolks-on-you'});

      await libTesting.poll(async () => {
        assert.equal(messages.length, 1);
        const got = messages[0];
        assert.equal(got.fields.routingKey, 'yolks-on-you');
        assert.equal(got.fields.exchange, `exchange/${client.namespace}/v2/${unique}`);
        assert.deepEqual(JSON.parse(got.content), {eggId: 'yolks-on-you'});
      });
    });

    test('publish *lots* of messages in parallel', async function() {
      this.slow(5000);

      // this is enough messages to fill the amqplib write buffer..
      const eggIds = [...Array(10000).keys()].map(id => id.toString());
      await Promise.all(eggIds.map(eggId => publisher.eggHatched({eggId})));

      await libTesting.poll(async () => {
        const got = messages.map(msg => msg.fields.routingKey);
        assert.deepEqual(got.length, eggIds.length, 'got expected number of messages');
        assert.deepEqual(got.sort(), eggIds.sort(), 'got exactly the expected messages');
      });
    });

    test('publish messages in parallel (with failed connections)', async function() {
      await Promise.all(['a', 'b', 'c'].map(eggId => publisher.eggHatched({eggId})));
      client.connections[0].amqp.close(); // force closure..
      await Promise.all(['i', 'j', 'k', 'l', 'm'].map(eggId => publisher.eggHatched({eggId})));
      client.connections[0].amqp.close(); // force closure..
      await Promise.all(['x', 'y', 'z'].map(eggId => publisher.eggHatched({eggId})));

      await libTesting.poll(async () => {
        const got = messages.map(msg => msg.fields.routingKey).sort();
        assert.deepEqual(got, ['a', 'b', 'c', 'i', 'j', 'k', 'l', 'm', 'x', 'y', 'z']);
      });
    });

    suiteTeardown(async function() {
      if (!PULSE_CONNECTION_STRING) {
        return;
      }

      await client.stop();
      await chan.close();
      await conn.close();
    });
  });

  suite('FakePulsePublisher', function() {
    let client, exchanges, schemaset, publisher;

    suiteSetup(async function() {
      client = new FakeClient();
      // this won't be necessary when namespace is a proper argument to the
      // FakeClient class..
      client.namespace = exchangeOptions.projectName;

      exchanges = new Exchanges(exchangeOptions);
      exchanges.declare({...declaration});

      schemaset = new SchemaSet({
        serviceName: exchangeOptions.serviceName,
        folder: path.join(__dirname, 'schemas'),
      });

      publisher = await exchanges.publisher({
        rootUrl: libUrls.testRootUrl(),
        schemaset,
        client,
      });
    });

    test('fake publishing', async function() {
      const messages = [];
      publisher.on('message', msg => messages.push(msg));
      await publisher.eggHatched({eggId: 'badEgg'});
      assume(messages).to.deeply.equal([{
        exchange: 'exchange/taskcluster-lib-pulse/v2/egg-hatched',
        routingKey: 'badEgg',
        payload: {eggId: 'badEgg'},
        CCs: [],
      }]);
    });
  });
});
