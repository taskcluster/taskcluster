const events = require('events');
const debug = require('debug');
const amqplib = require('amqplib');
const assert = require('assert');

var clientCounter = 0;

/**
 * Build Pulse ConnectionString, from options on the form:
 * {
 *   username:          // Pulse username
 *   password:          // Pulse password
 *   hostname:          // Hostname to use
 * }
 */
const buildConnectionString = function({username, password, hostname, vhost}) {
  assert(username, 'options.username password is required');
  assert(password, 'options.password is required');
  assert(hostname, 'options.hostname is required');
  assert(vhost, 'options.vhost is required');

  // Construct connection string
  return [
    'amqps://',         // Ensure that we're using SSL
    encodeURI(username),
    ':',
    encodeURI(password),
    '@',
    hostname,
    ':',
    5671,                // Port for SSL
    '/',
    encodeURIComponent(vhost),
  ].join('');
};
exports.buildConnectionString = buildConnectionString;

/**
 * An object to create connections to a pulse server.  This class will
 * automatically handle reconnecting as necessary.
 *
 * AMQP is a very connection-oriented protocol.  For example, a client using
 * non- durable queues will need to re-declare those queues on every new
 * connection.  Similarly, a consumer must re-start consumption on every new
 * connection.  This class emits a `connected` event on each new
 * connection, and that function should re-establish any state as required for
 * the new connection.
 *
 * Connections are automatically cycled periodically, regardless of any problems
 * with the connection itself, in order to exercise the reconnection logic. When
 * this occurs, the old connection is held open for 30 seconds to allow any pending
 * publish operations or message consumptions to complete.
 *
 * Options:
 * * connectionString
 * * username
 * * password
 * * hostname
 * * vhost
 * * recycleInterval (ms; default 1h)
 * * retirementDelay (ms; default 30s)
 */
class Client extends events.EventEmitter {
  constructor({username, password, hostname, vhost, connectionString, recycleInterval, retirementDelay}) {
    super();

    if (connectionString) {
      assert(!username, 'Can\'t use `username` along with `connectionString`');
      assert(!password, 'Can\'t use `password` along with `connectionString`');
      assert(!hostname, 'Can\'t use `hostname` along with `connectionString`');
      assert(!vhost, 'Can\'t use `hostname` along with `connectionString`');
      this.connectionString = connectionString;
    } else {
      connectionString = buildConnectionString({username, password, hostname, vhost});
    }

    this.recycleInterval = recycleInterval || 3600 * 1000;
    this.retirementDelay = retirementDelay || 30 * 1000;
    this.running = false;
    this.connections = [];
    this.connectionCounter = 0;

    this.id = ++clientCounter;
    this.debug = debug(`taskcluster-lib-pulse:client:${this.id}`);
  }

  /**
   * Start connecting and stay connected until stop() is called
   */
  start() {
    assert(!this.running, 'Already running');
    this.debug('starting');
    this.running = true;
    this.recycle();

    this._interval = setInterval(
      () => this.recycle(),
      this.recycleInterval);
  }

  async stop() {
    assert(this.running, 'Not running');
    this.debug('stopping');
    this.running = false;

    clearInterval(this._interval);
    this._interval = null;

    this.recycle();

    // wait until all existing connections are finished
    const unfinished = this.connections.filter(conn => conn.state !== 'finished');
    if (unfinished.length > 0) {
      await Promise.all(unfinished.map(
        conn => new Promise(resolve => { conn.once('finished', resolve); })));
    }
  }

  /**
   * Create a new connection, retiring any existing connection.
   */
  recycle() {
    this.debug('recycling');

    if (this.connections.length) {
      const currentConn = this.connections[0];
      currentConn.retire();
    }

    if (this.running) {
      const newConn = new Connection(this, ++this.connectionCounter);
      newConn.once('connected', () => {
        this.emit('connected', newConn);
      });
      newConn.once('finished', () => {
        this.connections = this.connections.filter(conn => conn.id !== newConn.id);
      });
      this.connections.unshift(newConn);
    }
  }
}

exports.Client = Client;

/**
 * A single connection to a pulse server.  This is a thin wrapper around a raw
 * AMQP connection, instrumented to inform the parent Client of failures
 * and trigger a reconnection.  It is possible to have multiple Connection
 * objects in the same process at the same time, while one is being "retired" but
 * is lingering around to send ack's for any in-flight message handlers.
 *
 * The instance's `amqp` property is the amqp connection object.  In the event of any
 * issues with the connection, call the instance's `failed` method.  This will initiate
 * a retirement of the connection and creation of a new connection.
 *
 * The instance will emit a `connected` event when it connects to the pulse server.
 * This event occurs before the connection is provided to a user, so it is only
 * of interest to the Client class.
 *
 * This instance will emit a `retiring` event just before it is retired.  Users
 * should cancel consuming from any channels, as a new connection will soon
 * begin consuming.  Errors from such cancellations should be logged and
 * ignored.  This connection will remain open for 30 seconds to allow any
 * in-flight message processing to complete.
 *
 * The instance will emit `finished` when the connection is finally closed.
 *
 * A connection's state can be one of
 *
 *  - connecting -- waiting for a connection to complete
 *  - connected -- connection is up and running
 *  - retiring -- in the process of retiring
 *  - finished -- no longer connected
 *
 *  Note that an instance that fails to connect will skip from `connecting` to
 *  `retiring`.
 *
 */
class Connection extends events.EventEmitter {
  constructor(client, id) {
    super();

    this.client = client;
    this.id = id;
    this.amqp = null;

    this.debug = debug(`taskcluster-lib-pulse:connection:${client.id}.${id}`);

    this.connect();
  }

  connect() {
    this.debug('connecting');
    this.state = 'connecting';

    amqplib.connect(this.client.connectionString, {
      heartbeat: 120,
      noDelay: true,
      timeout: 30 * 1000,
    }).then(
      amqp => {
        if (this.state !== 'connecting') {
          // we may have been retired already, in which case we do not need this
          // connection
          amqp.close();
          return;
        }
        this.amqp = amqp;

        amqp.on('error', err => {
          if (this.state === 'connected') {
            this.debug(`error from aqplib connection: ${err}`);
            this.failed();
          }
        });

        amqp.on('close', err => {
          if (this.state === 'connected') {
            this.debug('connection closed unexpectedly');
            this.failed();
          }
        });

        this.debug('connected');
        this.state = 'connected';
        this.emit('connected');
      },
      err => {
        // TODO: make a minimum interval between connection attempts, to avoid
        // issue with bad credentials
        this.debug(`Error while connecting: ${err}`);
        this.failed();
      });
  }

  failed() {
    if (this.state === 'retired' || this.state === 'finished') {
      // failure doesn't matter at this point
      return;
    }
    this.debug('failed');
    this.client.recycle();
  }

  retire() {
    if (this.state === 'retiring' || this.state === 'finished') {
      return;
    }

    this.debug('retiring');
    this.state = 'retiring';
    this.emit('retiring');

    // actually close this connection 30 seconds later
    setTimeout(() => {
      this.debug('finished; closing AMQP connection');
      try {
        this.amqp.close();
      } catch (err) {
        // ignore..
      }
      this.amqp = null;
      this.state = 'finished';
      this.emit('finished');
    }, this.client.retirementDelay);
  }
}

exports.Connection = Connection;
