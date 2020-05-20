const events = require('events');
const amqplib = require('amqplib');
const assert = require('assert');
const {MonitorManager} = require('taskcluster-lib-monitor');

let clientCounter = 0;

MonitorManager.register({
  name: 'pulseConnected',
  title: 'Connection to pulse established',
  type: 'pulse.connected',
  level: 'info',
  version: 1,
  description: `
    A connection to Pulse has been established.  Taskcluster services
    automatically reconnect to Pulse periodically and in the event of
    an error, but rapid reconnections may signal a Pulse failure.`,
  fields: {},
});

MonitorManager.register({
  name: 'pulseDisconnected',
  title: 'Connection to pulse has ended',
  type: 'pulse.disconnected',
  level: 'info',
  version: 1,
  description: `
    A connection to Pulse has ended or failed.  This may be due to normal
    reconnection or to an error communicating with Pulse.  The service
    automatically reconnects, so even an error is not necessarily a problem.`,
  fields: {
    error: 'The error message, if the disconnection was due to an error.',
  },
});

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
 * * credentials (async function )
 * * recycleInterval (ms; default 1h)
 * * retirementDelay (ms; default 30s)
 * * minReconnectionInterval (ms; default 15s)
 * * monitor (taskcluster-lib-monitor instance)
 *
 * The pulse namespace for this user is available as `client.namespace`.
 */
class Client extends events.EventEmitter {
  constructor({namespace, recycleInterval, retirementDelay, minReconnectionInterval, monitor, credentials,
    username, password, hostname, vhost, connectionString}) {
    super();

    assert(!username, 'username is deprecated');
    assert(!password, 'password is deprecated');
    assert(!hostname, 'hostname is deprecated');
    assert(!vhost, 'vhost is deprecated');
    assert(!connectionString, 'connectionString is deprecated');

    assert(credentials, 'credentials is required');
    this.credentials = credentials;

    assert(monitor, 'monitor is required');
    this.monitor = monitor;

    assert(namespace, 'namespace is required');
    this.namespace = namespace;
    this._retirementDelay = retirementDelay || 30 * 1000;
    this._minReconnectionInterval = minReconnectionInterval || 15 * 1000;
    this.running = false;
    this.connections = [];
    this.lastConnectionTime = 0;
    this.id = ++clientCounter;

    // we might have many event listeners in a busy service, each listening for
    // 'connected'
    this.setMaxListeners(Infinity);

    this.running = true;
    this.recycle();

    this._recycleInterval = setInterval(
      () => this.recycle(),
      recycleInterval || 3600 * 1000);
  }

  async stop() {
    assert(this.running, 'Not running');
    this.running = false;
    clearInterval(this._recycleInterval);
    this._recycleInterval = null;

    this.recycle();

    // wait until all existing connections are finished
    const unfinished = this.connections.filter(conn => conn.state !== 'finished');
    if (unfinished.length > 0) {
      await Promise.all(unfinished.map(
        conn => new Promise(resolve => { conn.once('finished', resolve); })));
    }
  }

  /**
   * Create a new connection, retiring any existing connection.  This is a "fire-
   * and-forget" method, that will never throw an exception and need not be
   * awaited.
   */
  recycle() {
    try {
      // Note that errors here are likely to leave the connection in a "hung" state;
      // nothing here should depend on network access or anything else that can
      // fail intermittently.
      if (this.connections.length) {
        const currentConn = this.connections[0];
        currentConn.retire();
      }

      if (this.running) {
        const newConn = this._startConnection();

        newConn.once('connected', () => {
          this.emit('connected', newConn);
        });
        newConn.once('finished', () => {
          this.connections = this.connections.filter(conn => conn !== newConn);
        });
        newConn.once('failed', () => {
          this.recycle();
        });
        this.connections.unshift(newConn);
      }
    } catch (err) {
      this.monitor.reportError(err);
    }
  }

  _startConnection() {
    // This method is part of recycle() and bears the same cautions about failure
    const newConn = new Connection(this.monitor, this._retirementDelay);

    // don't actually start connecting until at least minReconnectionInterval has passed
    const earliestConnectionTime = this.lastConnectionTime + this._minReconnectionInterval;
    const now = new Date().getTime();
    setTimeout(async () => {
      if (newConn.state !== 'waiting') {
        // the connection is no longer waiting, so don't proceed with
        // connecting (this is rare, but can occur if the recycle timer
        // occurs at just the wrong moment)
        return;
      }

      try {
        this.lastConnectionTime = new Date().getTime();
        const {connectionString} = await this.credentials();
        newConn.connect(connectionString);
      } catch (err) {
        this.monitor.log.pulseDisconnected({
          error: `Error while fetching credentials: ${err}`,
        });
        newConn.failed();
      }
    }, now < earliestConnectionTime ? earliestConnectionTime - now : 0);

    return newConn;
  }

  /**
   * Get a full object name, following the Pulse security model,
   * `<kind>/<namespace>/<name>`.  This is useful for manipulating these objects
   * directly, for example to modify the bindings of an active queue.
   */
  fullObjectName(kind, name) {
    assert(kind, 'kind is required');
    assert(name, 'name is required');
    return `${kind}/${this.namespace}/${name}`;
  }

  /**
   * Listen for a `connected` event, but call the handler with the existing connection
   * if this client is already connected.  Returns a callable that will stop listening.
   */
  onConnected(handler) {
    this.on('connected', handler);
    const conn = this.activeConnection;
    if (conn) {
      handler(conn);
    }
    return () => this.removeListener('connected', handler);
  }

  /**
   * The active connection, if any.  This is useful when starting to use an already-
   * running client (which is what onConnected does for you):
   *   client.on('connected', setupConnection);
   *   if (client.activeConnection) {
   *     await setupConnection(client.activeConnection);
   *   }
   */
  get activeConnection() {
    if (this.running && this.connections.length && this.connections[0].state === 'connected') {
      return this.connections[0];
    }
    return undefined;
  }

  /**
   * Run the given async function with a connection.  This is similar to
   * client.once('connected', ..), except that it will fire immediately if
   * the client is already connected.  This does *not* automatically re-run
   * the function if the connection fails.
   */
  withConnection(fn) {
    if (this.activeConnection) {
      return fn(this.activeConnection);
    }

    return new Promise((resolve, reject) => {
      this.once('connected', conn => Promise.resolve(fn(conn)).then(resolve, reject));
    });
  }

  /**
   * Run the given async function with an amqplib channel or confirmChannel. This wraps
   * withConnection to handle closing the channel.
   */
  withChannel(fn, {confirmChannel} = {}) {
    return this.withConnection(async conn => {
      const method = confirmChannel ? 'createConfirmChannel' : 'createChannel';
      const channel = await conn.amqp[method]();

      // any errors on this channel will be handled as exceptions thrown within `fn`,
      // so the events can be ignored
      channel.on('error', () => {});

      try {
        return await fn(channel);
      } finally {
        try {
          await channel.close();
        } catch (err) {
          if (!(err instanceof amqplib.IllegalOperationError)) {
            // IllegalOperationError happens when we are closing a broken
            // channel; any other error trying to close the channel suggests
            // the connection is dead, so mark it failed.
            conn.failed();
          }
        }
      }
    });
  }
}

exports.Client = Client;

let nextConnectionId = 1;

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
 *  - waiting -- waiting for a call to connect() (for minReconnectionInterval)
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
  constructor(monitor, retirementDelay) {
    super();

    this.monitor = monitor;
    this.retirementDelay = retirementDelay;
    this.id = nextConnectionId++;
    this.amqp = null;

    // we might have many event listeners in a busy service, each listening for
    // 'retiring'
    this.setMaxListeners(Infinity);

    this.state = 'waiting';
  }

  async connect(connectionString) {
    if (this.state !== 'waiting') {
      return;
    }

    this.state = 'connecting';

    const amqp = await amqplib.connect(connectionString, {
      heartbeat: 120,
      noDelay: true,
      timeout: 30 * 1000,
    }).catch(err => {
      this.monitor.log.pulseDisconnected({error: `${err}`});
      this.failed();
    });

    if (amqp) {
      if (this.state !== 'connecting') {
        // we may have been retired already, in which case we do not need this
        // connection
        amqp.close();
        return;
      }
      this.amqp = amqp;

      amqp.on('error', err => {
        if (this.state === 'connected') {
          this.monitor.log.pulseDisconnected({error: `${err}`});
          this.failed();
        }
      });

      amqp.on('close', err => {
        if (this.state === 'connected') {
          this.monitor.log.pulseDisconnected({error: 'connection closed unexpectedly'});
          this.failed();
        }
      });

      // pass on blocked/unblocked messages; see
      // https://www.rabbitmq.com/connection-blocked.html#capabilities. Amqplib
      // includes 'connection.blocked' in the client properties for us
      amqp.on('blocked', () => { this.emit('blocked'); });
      amqp.on('unblocked', () => { this.emit('unblocked'); });

      this.monitor.log.pulseConnected();
      this.state = 'connected';
      this.emit('connected');
    }
  }

  failed() {
    if (this.state === 'retired' || this.state === 'finished') {
      // failure doesn't matter at this point
      return;
    }
    this.emit('failed');
  }

  retire() {
    if (this.state === 'retiring' || this.state === 'finished') {
      return;
    }

    this.state = 'retiring';
    this.emit('retiring');

    // actually close this connection 30 seconds later
    setTimeout(() => {
      if (this.amqp) {
        // ignore errors in close
        this.amqp.close().catch(err => {});
      }
      this.amqp = null;
      this.state = 'finished';
      this.emit('finished');
    }, this.retirementDelay);
  }
}

exports.Connection = Connection;
