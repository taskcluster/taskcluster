const {EventEmitter} = require('events');
const split2 = require('split2');

/**
 * This is an implementation of the worker-runner protocol documented at
 * https://github.com/taskcluster/taskcluster-worker-runner/blob/master/protocol.md
 */

/**
 * A transport should have a `send(message)` method to send messages,
 * and should emit a `message` event when one is received.  Since this
 * implements only the worker side of the protocol, invalid lines are
 * simply ignored.
 *
 * StreamTransport implements this interface using Node streams.
 */
class StreamTransport extends EventEmitter {
  constructor(input, output) {
    super();

    // line-buffer the input and react to individual messages
    const lines = input.pipe(split2());

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

    this.output = output;
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
   * Construct a new protocol, given the underlying transport and a Set defining the
   * supported capabilities.  Note that a smaller set of capabilties might be
   * negotiated, and that the initial set of capabilities is empty.
   */
  constructor(transport, supportedCapabilities) {
    super();

    this.transport = transport;
    this.capabilities = new Set();
    this.supportedCapabilities = supportedCapabilities;

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
  }

  /**
   * Send a message
   */
  send(message) {
    this.transport.send(message);
  }

  /**
   * Check whether a particular capability is available
   */
  async capable(cap) {
    await this._welcomedPromise;
    return this.capabilities.has(cap);
  }

  _handleWelcome(msg) {
    const remoteCapabilities = new Set(msg.capabilities);
    this.capabilities = new Set();
    for (let c of remoteCapabilities) {
      if (this.supportedCapabilities.has(c)) {
        this.capabilities.add(c);
      }
    }

    this.send({type: 'hello', capabilities: [...this.capabilities]});
  }
}

exports.Protocol = Protocol;
