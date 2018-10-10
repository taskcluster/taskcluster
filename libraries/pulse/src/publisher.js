const assert = require('assert');
const libUrls = require('taskcluster-lib-urls');
const debug = require('debug')('taskcluster-lib-pulse.publisher');
const EventEmitter = require('events');
const url = require('url');
const AWS = require('aws-sdk');

class Exchanges {
  constructor(options) {
    assert(options.serviceName, 'serviceName is required');
    assert(options.projectName, 'projectName is required');
    assert(options.version, 'version is required');
    assert(options.title, 'title is required');
    assert(options.description, 'description is required');

    Object.assign(this, options);
    this.entries = [];
    this.exchangePrefix = `exchange/${this.projectName}/${this.version}/`;
  }

  declare(entryOptions) {
    const entry = new Entry({exchanges: this, ...entryOptions});
    assert(!this.entries.some(e => e.name == entry.name),
      `entry with name ${entry.name} already declared`);
    assert(!this.entries.some(e => e.exchange == entry.exchange),
      `entry with exchange ${entry.exchange} already declared`);
    this.entries.push(entry);
  }

  reference() {
    return {
      version: 0,
      $schema: 'http://schemas.taskcluster.net/base/v1/exchanges-reference.json#',
      serviceName: this.serviceName,
      title: this.title,
      description: this.description,
      exchangePrefix: this.exchangePrefix,
      entries: this.entries.map(e => e.reference()),
    };
  }

  async publisher({rootUrl, schemaset, client, sendDeadline, publish, aws}) {
    let publisher;
    if (process.env.NODE_ENV !== 'production') {
      this.exchangePrefix = `exchange/${client.namespace}/${this.version}/`;
    }

    if (client.isFakeClient) {
      publisher = new FakePulsePublisher({rootUrl, schemaset, exchanges: this});
    } else {
      publisher = new PulsePublisher({rootUrl, schemaset, client, sendDeadline, exchanges: this});
    }
    if (publish) {
      assert.equal(rootUrl, 'https://taskcluster.net',
        'only taskcluster.net publishes references to S3');
      assert(aws, 'aws is required to publish references to S3');
      await publisher.publishReference(aws, this.reference());
    }
    await publisher._start();
    return publisher;
  }
}

exports.Exchanges = Exchanges;

class Entry {
  constructor({exchanges, ...options}) {
    assert(options.exchange, 'exchange is required');
    assert(options.name, 'name is required');
    assert(options.title, 'title is required');
    assert(options.description, 'description is required');
    assert(options.schema, 'schema is required');
    assert(options.routingKey, 'routingKey is required');
    assert(options.messageBuilder, 'messageBuilder is required');
    assert(options.routingKeyBuilder, 'routingKeyBuilder is required');
    assert(options.CCBuilder, 'CCBuilder is required');

    Object.assign(this, options);
    this.exchanges = exchanges;

    // perform this transformation once, to a URI relative to the service's schemas
    this.schema = `${exchanges.version}/${this.schema.replace(/\.ya?ml$/, '.json#')}`;

    this._validateRoutingKey();
  }

  /**
   * Return the subset of the reference document for this entry
   */
  reference() {
    return {
      type: 'topic-exchange',
      exchange: this.exchange,
      name: this.name,
      title: this.title,
      description: this.description,
      schema: this.schema,
      routingKey: this.routingKey.map(key => ({
        name: key.name,
        summary: key.summary,
        constant: !!key.constant,
        multipleWords: key.multipleWords,
        required: key.required,
      })),
    };
  }

  /**
   * Check that the routing key configuration is valid
   */
  _validateRoutingKey() {
    const keyNames = [];
    let sizeLeft = 255;
    let firstMultiWordKey = null;

    assert(Array.isArray(this.routingKey), 'routingKey must be an Array');
    for (let key of this.routingKey) {
      // Check that the key name is unique
      assert(keyNames.indexOf(key.name) === -1,
        `Routing key entry named ${key.name} already exists`);
      keyNames.push(key.name);

      // Check that we have a summary
      assert(typeof key.summary === 'string',
        `summary of routingKey entry ${key.name} is required.`);

      // Check that we only have one multipleWords key in the routing key. If we
      // have more than one then we can't really parse the routing key
      // automatically. And technically, there is probably little need for two
      // multiple word routing key entries.
      if (key.multipleWords) {
        assert(firstMultiWordKey === null,
          'Can\'t have two multipleWord entries in a routing key, ' +
               'here we have both \'' + firstMultiWordKey + '\' and ' +
               '\'' + key.name + '\'');
        firstMultiWordKey = key.name;
      }

      if (key.constant) {
        // Check that any constant is indeed a string
        assert(typeof key.constant === 'string',
          'constant must be a string, if provided');

        // Set maxSize
        if (!key.maxSize) {
          key.maxSize = key.constant.length;
        }
      }

      // Check that we have a maxSize
      assert(typeof key.maxSize == 'number' && key.maxSize > 0,
        `routingKey declaration ${key.name} must have maxSize > 0`);

      // Check size left in routingKey space
      if (sizeLeft != 255) {
        sizeLeft -= 1; // Remove one for the joining dot
      }
      sizeLeft -= key.maxSize;
      assert(sizeLeft >= 0, 'Combined routingKey cannot be larger than 255 ' +
             'including joining dots');
    }
  }
}

class PulsePublisher {
  constructor({rootUrl, schemaset, client, exchanges, sendDeadline}) {
    this.rootUrl = rootUrl;
    this.schemaset = schemaset;
    this.client = client;
    this.exchanges = exchanges;
    this.sendDeadline = sendDeadline || 12000;

    if (process.env.NODE_ENV === 'production') {
      assert.equal(client.namespace, exchanges.projectName,
        'client namespace must match projectName');
    }

    this._handleConnection = this._handleConnection.bind(this);
  }

  /**
   * Start the publisher. This is essentially an async constructor.
   */
  async _start() {
    this._setChannel(null);
    this.client.onConnected(this._handleConnection);

    await this._assertExchanges();
    await this._declareMethods();
  }

  /**
   * Set the current channel (or clear it, if null).
   *
   * This will ensure that this.channelPromise resolves to the
   * current channel (if one exists) or to the next channel created.
   */
  _setChannel(channel) {
    if (channel) {
      this._channel = channel;
      if (this._resolveChannelPromise) {
        // notify any waiters..
        this._resolveChannelPromise(channel);
        this._resolveChannelPromise = null;
      }
      // and make a clean, resolved promise for the channel
      this.channelPromise = Promise.resolve(channel);
    } else {
      // we now have no working channel, so clear everything
      // and set up to resolve channelPromise when we get one
      this._channel = null;
      if (!this._resolveChannelPromise) {
        this.channelPromise = new Promise(resolve => {
          this._resolveChannelPromise = resolve;
        });
      }
    }
  }

  /**
   * Handle a connected event from the client
   */
  async _handleConnection(connection) {
    try {
      this._connection = connection;
      const channel = await connection.amqp.createConfirmChannel();
      debug('using new channel');
      this._setChannel(channel);
    } catch (err) {
      this.client.monitor.reportError(err);
      this._connection = null;
      this._setChannel(null);
      connection.failed();
    }
  }

  /**
   * Assert all exchanges on the AMQP server
   */
  async _assertExchanges() {
    await this.client.withChannel(async chan => {
      await Promise.all(this.exchanges.entries.map(async entry => {
        const exchange = this.exchanges.exchangePrefix + entry.exchange;
        debug(`asserting exchange ${exchange}`);
        await chan.assertExchange(exchange, 'topic', {
          durable: true,
          internal: false,
          autoDelete: false,
        });
      }));
    });
  }

  /**
   * Declare the publishing methods based on the exchagnes.declare(..) calls
   * made earlier.
   */
  async _declareMethods() {
    const validator = await this.schemaset.validator(this.rootUrl);

    for (let entry of this.exchanges.entries) {
      const exchange = this.exchanges.exchangePrefix + entry.exchange;

      this[entry.name] = async (...args) => {
        // Construct message and routing key from arguments
        const message = entry.messageBuilder.apply(undefined, args);
        this._validateMessage(
          this.rootUrl,
          this.exchanges.serviceName,
          validator,
          entry,
          message);

        const routingKey = this._routingKeyToString(
          entry,
          entry.routingKeyBuilder.apply(undefined, args));

        const CCs = entry.CCBuilder.apply(undefined, args);
        assert(CCs instanceof Array, 'CCBuilder must return an array');

        // Serialize message to buffer
        const payload = new Buffer(JSON.stringify(message), 'utf8');

        await this._send(exchange, routingKey, payload, CCs);
      };
    }
  }

  async stop() {
    this.client.removeListener(this._handleConnection);
    this.channelPromise = Promise.reject(new Error('PulsePublisher is stopped'));
  }

  async _send(exchange, routingKey, payload, CCs) {

    // channel.publish uses a callback (since we use a confirm channel). The docs
    // specify that it also returns false if the write buffer is full -- but importantly
    // it still buffers the message in this case, reflecting the behavior of
    // https://nodejs.org/api/net.html#net_socket_write_data_encoding_callback
    // Since we have no way to convey this information to callers, we ignore
    // the returned boolean.

    // calculate the time after which we will not start a new send operation
    const deadline = new Date(new Date().getTime() + this.sendDeadline);
    let lastError = null;
    let tries = 0;

    // retry repeatedly until deadline; this getes rate-limited by the Client's
    // reconnection logic in the event of a server error
    const retry = async () => {
      while (new Date() < deadline) {
        try {
          const channel = await this.channelPromise;

          debug('%s message on exchange %s, routing key %s',
            tries++ ? 'Republishing' : 'Publishing', exchange, routingKey);
          await new Promise((resolve, reject) => {
            channel.publish(exchange, routingKey, payload, {
              persistent:         true,
              contentType:        'application/json',
              contentEncoding:    'utf-8',
              CC:                 CCs,
            }, (err) => {
              if (err) {
                reject(err);
              } else {
                resolve();
              }
            });
          });

          return;
        } catch (err) {
          lastError = err;

          // something went wrong, so mark the connection as failed and try
          // again (waiting for a new channel in the process)
          if (this._connection) {
            this._connection.failed();
          }
          this._setChannel(null);
        }
      }
    };

    let deadlineTimeout;
    const failAtDeadline = async () => {
      await new Promise(resolve => {
        deadlineTimeout = setTimeout(resolve, this.sendDeadline);
      });
      const err = lastError || new Error('PulsePublisher.sendDeadline exceeded');
      err.retries = tries;
      err.exchange = exchange;
      err.routingKey = routingKey;
      throw err;
    };

    await Promise.race([retry(), failAtDeadline()]);
    clearTimeout(deadlineTimeout);
  }

  /**
   * Validate a message against the schema for this entry
   */
  _validateMessage(rootUrl, serviceName, validator, entry, message) {
    const schema = libUrls.schema(rootUrl, serviceName, entry.schema);
    var err = validator(message, schema);
    if (err) {
      debug('Failed to validate message: %j against schema: %s, error: %j',
        message, entry.schema, err);
      throw new Error('Message validation failed. ' + err);
    }
  }

  /**
   * Given the result of entry.rouingKeyBuilder, create a routing key string
   */
  _routingKeyToString(entry, routingKey) {
    return entry.routingKey.map(key => {
      let word = routingKey[key.name];
      if (key.constant) {
        word = key.constant;
      }
      if (!key.required && (word === undefined || word === null)) {
        word = '_';
      }
      // Convert numbers to strings
      if (typeof word === 'number') {
        word = word.toString();
      }
      assert(typeof word === 'string',
        `non-string routingKey entry ${key.name}: ${word}`);
      assert(word.length <= key.maxSize,
        `routingKey word: ${word} for ${key.name} is longer than ${key.maxSize}`);
      if (!key.multipleWords) {
        assert(word.indexOf('.') === -1,
          `routingKey ${key.name} value ${word} contains '.'`);
      }
      return word;
    }).join('.');
  }

  /**
   * Publish the reference to S3; this is only used in the taskcluster.net deployment
   */
  async publishReference(aws, reference) {
    const {serviceName, version} = this.exchanges;
    const refUrl = libUrls.exchangeReference('https://taskcluster.net', serviceName, version);
    const {hostname, path} = url.parse(refUrl);

    const s3 = new AWS.S3(aws);
    await s3.putObject({
      Bucket:           hostname,
      Key:              path.slice(1), // omit leading `/`
      Body:             JSON.stringify(reference, undefined, 2),
      ContentType:      'application/json',
    }).promise();
  }
}

class FakePulsePublisher extends EventEmitter {
  constructor({rootUrl, schemaset, client, exchanges}) {
    super();
    this.rootUrl = rootUrl;
    this.schemaset = schemaset;
    this.exchanges = exchanges;

    // bind a few methods from the real PulsePublisher here
    this._declareMethods = PulsePublisher.prototype._declareMethods.bind(this);
    this._validateMessage = PulsePublisher.prototype._validateMessage.bind(this);
    this._routingKeyToString = PulsePublisher.prototype._routingKeyToString.bind(this);
  }

  async _start() {
    // steal _declareMethods from the real PulsePublisher; the resulting
    // methods will call our _send method
    this._declareMethods();
  }

  async _send(exchange, routingKey, payload, CCs) {
    this.emit('message', {exchange, routingKey, payload: JSON.parse(payload), CCs});
  }
}
