const assert = require('assert');
const {EventEmitter} = require('events');
const split2 = require('split2');

/**
 * This is an implementation of the worker-runner protocol documented at
 * https://github.com/taskcluster/taskcluster/blob/master/tools/worker-runner/protocol.md
 */

/**
 * A transport should have a `send(message)` method to send messages,
 * and should emit a `message` event when one is received.  Since this
 * implements only the worker side of the protocol, invalid lines are
 * simply ignored.
 *
 * Messages are not delivered and consuming from the input does not begin
 * until the start method has been called.
 *
 * StreamTransport implements this interface using Node streams.
 */
class StreamTransport extends EventEmitter {
  constructor(input, output) {
    super();

    this.input = input;
    this.output = output;
  }

  start() {
    // line-buffer the input and react to individual messages
    const lines = this.input.pipe(split2());

    lines.on('data', line => {
      if (!line.startsWith('~{') || !line.endsWith('}')) {
        return;
      }
      let msg;
      try {
        msg = JSON.parse(line.slice(1));
      } catch (err) {
        return;
      }
      if (!msg.type) {
        return;
      }
      this.emit('message', msg);
    });

    // emit end as well when the input closes, for testing purposes
    lines.on('end', () => this.emit('end'));
  }

  send(message) {
    this.output.write('~' + JSON.stringify(message) + '\n');
  }
}

exports.StreamTransport = StreamTransport;

/**
 * Given a transport, Protocol implements the higher levels -- specifically, the
 * capability negotiation.  It implements only the worker side of that negotiation.
 *
 * It emits each message from the transport as event `<type>-msg`.  For example, a
 * "welcome" message is emitted as a `welcome-msg` event.
 */
class Protocol extends EventEmitter {
  /**
   * Construct a new protocol, given the underlying transport.
   */
  constructor(transport) {
    super();

    this.transport = transport;
    this.remoteCapabilities = new Set();
    this.localCapabilities = new Set();

    this.transport.on('message', msg => {
      const event = `${msg.type}-msg`;
      this.emit(event, msg);
    });

    // create a promise that will resolve when we have received a welcome
    // message and know the extent of capabilities available.
    this._welcomedPromise = new Promise(resolve =>
      this.on('welcome-msg', msg => {
        this._handleWelcome(msg);
        resolve();
      }));

    this.started = false;
  }

  /**
   * Start the protocol and its underlying transport
   */
  start() {
    this.transport.start();
    this.started = true;
  }

  /**
   * Send a message
   */
  send(message) {
    assert(this.started);
    this.transport.send(message);
  }

  /**
   * Add a capability to this protocol.  This can only be called before start,
   * before the capability negotiation takes place.
   */
  addCapability(cap) {
    assert(!this.started);
    this.localCapabilities.add(cap);
  }

  /**
   * Check whether a particular capability is available
   */
  async capable(cap) {
    await this._welcomedPromise;
    return this.localCapabilities.has(cap) && this.remoteCapabilities.has(cap);
  }

  _handleWelcome(msg) {
    this.remoteCapabilities = new Set(msg.capabilities);
    this.send({type: 'hello', capabilities: [...this.localCapabilities]});
  }
}

exports.Protocol = Protocol;
