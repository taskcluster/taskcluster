import { Client, Exchanges, connectionStringCredentials } from '../src/index.js';
import path from 'path';
import amqplib from 'amqplib';
import assume from 'assume';
import assert from 'assert';
import SchemaSet from '@taskcluster/lib-validate';
import libUrls from 'taskcluster-lib-urls';
import helper from './helper.js';
import { suiteName, poll } from '@taskcluster/lib-testing';

const __dirname = new URL('.', import.meta.url).pathname;

helper.secrets.mockSuite(suiteName(), ['pulse'], function(mock, skipping) {
  if (mock) {
    return; // Only test with real creds
  }
  let connectionString;
  const exchangeOptions = {
    serviceName: 'lib-pulse',
    projectName: '@taskcluster/lib-pulse',
    apiVersion: 'v2',
    title: 'tc-lib-pulse tests',
    description: 'testing stuff',
  };

  const declarationNoConstant = {
    exchange: 'egg-hatched',
    name: 'eggHatched',
    title: 'Egg Hatched',
    description: 'an egg hatched',
    schema: 'egg-hatched-message.yml',
    routingKey: [{
      name: 'eggId',
      summary: 'Identifier that we use for testing',
      multipleWords: false,
      required: true,
      maxSize: 22,
    }],
    messageBuilder: msg => msg,
    routingKeyBuilder: msg => msg,
    CCBuilder: msg => [],
  };

  const declarationConstant = {
    exchange: 'egg-hatched',
    name: 'eggHatched',
    title: 'Egg Hatched',
    description: 'an egg hatched',
    schema: 'egg-hatched-message.yml',
    routingKey: [{
      name: 'eggId',
      summary: 'Identifier that we use for testing',
      constant: 'primary',
      required: true,
      maxSize: 22,
    }],
    messageBuilder: msg => msg,
    routingKeyBuilder: msg => msg,
    CCBuilder: msg => [],
  };

  const monitor = helper.monitor;

  setup(async function() {
    connectionString = helper.secrets.get('pulse').connectionString;
  });

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
      assume(() => exchanges.declare({ ...declarationNoConstant, routingKey: [{}] }))
        .to.throw(/is required/);
    });

    test('declare routing key too long fails', function() {
      const exchanges = new Exchanges(exchangeOptions);
      const routingKey = [
        {
          name: 'testId',
          summary: 'Identifier that we use for testing',
          multipleWords: false,
          required: true,
          maxSize: 22,
        }, {
          name: 'taskRoutingKey',
          summary: 'Test specific routing-key: `test.key`',
          multipleWords: true,
          required: true,
          maxSize: 128,
        }, {
          name: 'state',
          summary: 'State of something',
          multipleWords: false,
          required: false,
          maxSize: 128,
        },
      ];
      assume(() => exchanges.declare({ ...declarationNoConstant, routingKey }))
        .to.throw(/cannot be larger than/);
    });

    test('declaration with same name fails', function() {
      const exchanges = new Exchanges(exchangeOptions);
      exchanges.declare({ ...declarationNoConstant, name: 'x', exchange: 'xx' });
      assume(() => exchanges.declare({ ...declarationNoConstant, name: 'x', exchange: 'yy' }))
        .to.throw(/already declared/);
    });

    test('declaration with same exchange fails', function() {
      const exchanges = new Exchanges(exchangeOptions);
      exchanges.declare({ ...declarationNoConstant, name: 'x', exchange: 'xx' });
      assume(() => exchanges.declare({ ...declarationNoConstant, name: 'y', exchange: 'xx' }))
        .to.throw(/already declared/);
    });

    test('sucessful declaration', function() {
      const exchanges = new Exchanges(exchangeOptions);
      exchanges.declare(declarationNoConstant);
      // doesn't throw anything..
    });

    test('reference is correct, no constant routing key', function() {
      const exchanges = new Exchanges(exchangeOptions);
      exchanges.declare(declarationNoConstant);
      assume(exchanges.reference()).to.deeply.equal({
        $schema: '/schemas/common/exchanges-reference-v0.json#',
        apiVersion: 'v2',
        exchangePrefix: 'exchange/@taskcluster/lib-pulse/v2/',
        serviceName: 'lib-pulse',
        title: 'tc-lib-pulse tests',
        description: 'testing stuff',
        entries: [{
          description: 'an egg hatched',
          exchange: 'egg-hatched',
          name: 'eggHatched',
          routingKey: [{
            constant: undefined,
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

    test('reference is correct, constant in the routing key', function() {
      const exchanges = new Exchanges(exchangeOptions);
      exchanges.declare(declarationConstant);
      assume(exchanges.reference()).to.deeply.equal({
        $schema: '/schemas/common/exchanges-reference-v0.json#',
        apiVersion: 'v2',
        exchangePrefix: 'exchange/@taskcluster/lib-pulse/v2/',
        serviceName: 'lib-pulse',
        title: 'tc-lib-pulse tests',
        description: 'testing stuff',
        entries: [{
          description: 'an egg hatched',
          exchange: 'egg-hatched',
          name: 'eggHatched',
          routingKey: [{
            constant: 'primary',
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

      client = new Client({
        credentials: connectionStringCredentials(connectionString),
        retirementDelay: 50,
        minReconnectionInterval: 20,
        monitor,
        namespace: 'guest',
      });
      // this won't be necessary when namespace is a proper argument to the
      // Client class..
      client.namespace = exchangeOptions.projectName;

      exchanges = new Exchanges(exchangeOptions);
      exchanges.declare({ ...declarationNoConstant, exchange: unique });

      schemaset = new SchemaSet({
        serviceName: exchangeOptions.serviceName,
        folder: path.join(__dirname, 'schemas'),
      });

      publisher = await exchanges.publisher({ // eslint-disable-line require-atomic-updates
        rootUrl: libUrls.testRootUrl(),
        schemaset,
        client,
      });

      // otherwise, set up a queue to listen for messages, using amqplib
      // directly to avoid assuming the test subject works
      conn = await amqplib.connect(connectionString);
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
      await assume(publisher.eggHatched({ bogusThing: 'uhoh' }))
        .rejects();
    });

    test('message with too-long routingKey fails', async function() {
      await assume(publisher.eggHatched({ eggId: 'uhoh! '.repeat(100) }))
        .rejects();
    });

    test('publish a message', async function() {
      await publisher.eggHatched({ eggId: 'yolks-on-you' });

      await poll(async () => {
        assert.equal(messages.length, 1);
        const got = messages[0];
        assert.equal(got.fields.routingKey, 'yolks-on-you');
        assert.equal(got.fields.exchange, `exchange/${client.namespace}/v2/${unique}`);
        assert.deepEqual(JSON.parse(got.content), { eggId: 'yolks-on-you' });
      });
    });

    test('publish *lots* of messages in parallel', async function() {
      this.slow(5000);

      // this is enough messages to fill the amqplib write buffer..
      const eggIds = [...Array(10000).keys()].map(id => id.toString());
      await Promise.all(eggIds.map(eggId => publisher.eggHatched({ eggId })));

      await poll(async () => {
        const got = messages.map(msg => msg.fields.routingKey);
        assert.deepEqual(got.length, eggIds.length, 'got expected number of messages');
        assert.deepEqual(got.sort(), eggIds.sort(), 'got exactly the expected messages');
      });
    });

    test('publish messages in parallel (with failed connections)', async function() {
      await Promise.all(['a', 'b', 'c'].map(eggId => publisher.eggHatched({ eggId })));
      client.connections[0].amqp.close(); // force closure..
      await Promise.all(['i', 'j', 'k', 'l', 'm'].map(eggId => publisher.eggHatched({ eggId })));
      client.connections[0].amqp.close(); // force closure..
      await Promise.all(['x', 'y', 'z'].map(eggId => publisher.eggHatched({ eggId })));

      await poll(async () => {
        const got = messages.map(msg => msg.fields.routingKey).sort();
        assert.deepEqual(got, ['a', 'b', 'c', 'i', 'j', 'k', 'l', 'm', 'x', 'y', 'z']);
      });
    });

    suiteTeardown(async function() {
      if (!connectionString) {
        return;
      }

      await client.stop();
      await chan.close();
      await conn.close();
    });
  });
});
