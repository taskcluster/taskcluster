const assert = require('assert');
const {QlobberTrue} = require('qlobber');
const EventEmitter = require('events');
const debug = require('debug');

module.exports = ({helper, skipping, namespace}) => {
  let client;
  const debugPulseAssertion = debug('withPulse');

  suiteSetup('withPulse', async function() {
    if (skipping && skipping()) {
      return;
    }

    await helper.load('cfg');
    client = new FakeClient(namespace);
    helper.load.inject('pulseClient', client);

    const matchingMessageExists = (exchange, check) =>
      client.messages.some(message =>
        (!exchange || message.exchange.endsWith(exchange)) &&
        (!check || check(message)));

    helper.onPulsePublish = callback => {
      client._onPublish = callback;
    };

    helper.assertPulseMessage = (exchange, check) => {
      if (!matchingMessageExists(exchange, check)) {
        debugPulseAssertion(`${client.messages.length} pulse messages recorded:`);
        client.messages.forEach(({exchange, routingKey}) =>
          debugPulseAssertion(`${exchange} - ${routingKey}`));
        throw new Error(`No matching messages found with exchange ${exchange}`);
      }
    };

    helper.assertNoPulseMessage = (exchange, check) => {
      if (matchingMessageExists(exchange, check)) {
        debugPulseAssertion(`${client.messages.length} pulse messages recorded:`);
        client.messages.forEach(({exchange, routingKey}) =>
          debugPulseAssertion(`${exchange} - ${routingKey}`));
        throw new Error(`Matching messages found with exchange ${exchange}`);
      }
    };

    helper.clearPulseMessages = () => {
      client.messages = [];
    };

    helper.fakePulseMessage = async ({exchange, routingKey, routes, ...message}) => {
      let delivered = false;
      assert(exchange, 'fakePulseMessage requires an exchange');
      assert(routingKey, 'fakePulseMessage requires a routingKey');

      // Find consumers that match this message.  NOTE: we do this matching here and not
      // in tc-lib-pulse because qlobber is a devDependency and is not available in
      // production code.
      for (let cons of client.consumers) {
        for (let binding of cons.bindings) {
          if (binding.exchange === exchange) {
            // use Qlobber in a really inefficient manner to match the routing key
            const q = new QlobberTrue();
            q.add(binding.routingKeyPattern);
            if (q.test(routingKey) || routes.some(r => q.test(`route.${r}`))) {
              delivered = true;
              await cons.handleMessage({exchange, routingKey, routes, ...message});
            }
          }
        }
      }
      if (!delivered) {
        debugPulseAssertion(`${client.consumers.length} consumers registered:`);
        client.consumers.forEach(cons =>
          debugPulseAssertion('- ' + cons.bindings.map(({exchange, routingKeyPattern}) =>
            `${exchange} - ${routingKeyPattern}`).join('; ')));

        throw new Error('Fake message not delivered to any consumers');
      }
    };
  });

  setup('withPulse', function() {
    if (skipping && skipping()) {
      return;
    }

    helper.onPulsePublish();
    helper.clearPulseMessages();
  });
};

/**
 * FakeClient is a fake version of tc-lib-pulse's `Client` class, used to fake
 * publishing and consuming.  Taskcluster-lib-pulse identifies it via
 * `isFakeClient` and calls the `make..` methods.
 */
class FakeClient {
  constructor(namespace) {
    this.isFakeClient = true;
    this._onPublish = null;
    this.namespace = namespace;
    this.debug = debug('taskcluster-lib-pulse.conn-fake');

    // a list of current FakePulseConsumer instances
    this.consumers = [];

    // a list of messages from FakePulsePublisher
    this.messages = [];
  }

  fullObjectName(kind, name) {
    return `${kind}/${this.namespace}/${name}`;
  }

  async stop() { }
  async recycle() {}
  get activeConnection() {
    return undefined;
  }

  async onConnected() {
    this.debug('FakeClient.onConnected will never call its callback');
  }

  async withConnection() {
    this.debug('FakeClient.withConnection returns immediately without calling its callback');
  }

  async withChannel() {
    this.debug('FakeClient.withChannel returns immediately without calling its callback');
  }

  // called by tc-lib-pulse's `consume(..)` when given a fake client
  makeFakeConsumer(options) {
    const consumer = new FakePulseConsumer(options);
    this.consumers.push(consumer);
    return consumer;
  }

  // called by tc-lib-pulse's `Exchanges.publisher` when given a fake client
  makeFakePublisher(options) {
    return new FakePulsePublisher(options);
  }
}

class FakePulseConsumer {
  constructor({client, bindings, queueName, prefetch, ephemeral, onConnected, handleMessage, ...queueOptions}) {
    assert(handleMessage, 'Must provide a message handler function');

    this.client = client;
    this.bindings = bindings;

    if (ephemeral) {
      assert(!queueName, 'Must not pass a queueName for ephemeral consumers');
      assert(onConnected, 'Must pass onConnected for ephemeral consumers');
    } else {
      assert(queueName, 'Must pass a queueName');
    }
    this.ephemeral = ephemeral;
    this.handleMessage = handleMessage;
    this.onConnected = onConnected;
    this.debug = debug('FakePulseConsumer');
  }

  async stop() {
    this.debug('stopping');
    this.client.consumers = this.client.consumers.filter(c => c !== this);
  }

  /**
   * Simulate a connection.  Use this only with ephemeral consumers
   */
  async connected() {
    assert(this.ephemeral, 'not an ephemeral consumer');
    await this.onConnected();
  }

  /**
   * Inject a fake message.  This calls the supplied handleMessage
   * function directly.
   */
  async fakeMessage(msg) {
    this.debug(`injecting fake message ${JSON.stringify(msg)}`);
    await this.handleMessage(msg);
  }

  /**
   * Update the bindings; used to simulate what might be done with `bindQueue`
   * when running against a real RabbitMQ service.
   */
  setFakeBindings(bindings) {
    this.bindings = bindings;
  }
}

class FakePulsePublisher extends EventEmitter {
  constructor({rootUrl, schemaset, client, exchanges, PulsePublisher}) {
    super();
    this.rootUrl = rootUrl;
    this.schemaset = schemaset;
    this.client = client;
    this.exchanges = exchanges;

    // bind a few methods from the real PulsePublisher here
    this._declareMethods = PulsePublisher.prototype._declareMethods.bind(this);
    this._validateMessage = PulsePublisher.prototype._validateMessage.bind(this);
    this._routingKeyToString = PulsePublisher.prototype._routingKeyToString.bind(this);
  }

  async _start() {
    // steal _declareMethods from the real PulsePublisher; the resulting
    // methods will call our _send method
    await this._declareMethods();
  }

  async _send(exchange, routingKey, payload, CCs) {
    if (this.client._onPublish) {
      await this.client._onPublish(exchange, routingKey, payload, CCs);
    }
    this.client.messages.push({
      exchange,
      routingKey,
      payload: JSON.parse(payload),
      CCs,
    });
  }
}
