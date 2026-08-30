import resolveBindings from './resolveBindings.js';

const PING_INTERVAL_MS = 30000;

// Custom WebSocket close codes, in the 4000-4999 (application-defined) range,
// plus the standard 1011 (internal error) where that's the better fit.
const CLOSE_CODES = {
  PROTOCOL_ERROR: 4400,
  INSUFFICIENT_SCOPES: 4403,
  LIFETIME_EXCEEDED: 4408,
  INTERNAL_ERROR: 1011,
};

// Frame `type` values exchanged over the wire, in both directions. Named after
// the equivalent graphql-ws protocol messages this replaces.
const FRAME_TYPES = {
  CONNECTION_INIT: 'connection_init',
  CONNECTION_ACK: 'connection_ack',
  SUBSCRIBE: 'subscribe',
  SUBSCRIBE_ACK: 'subscribe_ack',
  UNSUBSCRIBE: 'unsubscribe',
  DATA: 'data',
  ERROR: 'error',
};

export default class EventsConnection {
  constructor({
    ws,
    kind,
    pulseEngine,
    clients,
    authFactory,
    monitor,
    socketAliveTimeoutMilliSeconds,
    connectionInitTimeoutMilliSeconds,
  }) {
    this.ws = ws;
    // how subscribe frames are interpreted ('raw' or 'named'), fixed by the
    // endpoint the client connected to
    this.kind = kind;
    this.pulseEngine = pulseEngine;
    this.clients = clients;
    this.authFactory = authFactory;
    this.monitor = monitor;
    // engine subscriptionIds owned by this connection
    this.subscriptions = new Set();
    this.connectionInitReceived = false;
    // cleared by each pong from the client, set again by each checkLiveness tick
    this.isAlive = true;
    this.pingInterval = setInterval(() => {
      this.checkLiveness();
    }, PING_INTERVAL_MS);

    this.lifetimeTimeout = setTimeout(() => {
      this.close(CLOSE_CODES.LIFETIME_EXCEEDED, 'Connection lifetime exceeded');
    }, socketAliveTimeoutMilliSeconds);

    this.connectionInitTimeout = setTimeout(() => {
      this.close(CLOSE_CODES.PROTOCOL_ERROR, 'Protocol error: no connection_init frame received');
    }, connectionInitTimeoutMilliSeconds);

    ws.on('message', data => {
      this.onMessage(data);
    });

    ws.on('close', closeCode => {
      clearTimeout(this.lifetimeTimeout);
      clearTimeout(this.connectionInitTimeout);
      clearInterval(this.pingInterval);

      const openSubscriptions = this.subscriptions.size;

      for (const subscriptionId of this.subscriptions) {
        this.pulseEngine.unsubscribe(subscriptionId);
      }
      this.subscriptions.clear();

      this.monitor.log.websocketClosed({ closeCode, openSubscriptions });
    });

    ws.on('error', err => {
      this.monitor.reportError(err);
    });

    ws.on('pong', () => {
      this.isAlive = true;
    });
  }

  // Called on each ping-interval tick: a client that has not answered the
  // previous ping is terminated (which fires 'close' and tears everything
  // down), otherwise it is pinged again.
  checkLiveness() {
    if (!this.isAlive) {
      this.ws.terminate();
      return;
    }

    this.isAlive = false;
    this.ws.ping();
  }

  send(frame) {
    return new Promise((resolve, reject) => {
      if (this.ws.readyState !== this.ws.OPEN) {
        reject(new Error('Socket is not open'));
        return;
      }

      this.ws.send(JSON.stringify(frame), err => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  sendError(fields) {
    return this.send({ type: FRAME_TYPES.ERROR, ...fields }).catch(() => {});
  }

  close(code, reason) {
    if (this.ws.readyState === this.ws.OPEN || this.ws.readyState === this.ws.CONNECTING) {
      this.ws.close(code, reason);
    }
  }

  async onMessage(data) {
    let frame;

    try {
      frame = JSON.parse(data.toString());
    } catch {
      this.close(CLOSE_CODES.PROTOCOL_ERROR, 'Protocol error: malformed JSON');
      return;
    }

    if (!frame || typeof frame.type !== 'string') {
      this.close(CLOSE_CODES.PROTOCOL_ERROR, 'Protocol error: missing frame type');
      return;
    }

    if (!this.connectionInitReceived) {
      if (frame.type !== FRAME_TYPES.CONNECTION_INIT) {
        this.close(CLOSE_CODES.PROTOCOL_ERROR, 'Protocol error: first frame must be connection_init');
        return;
      }
      await this.handleConnectionInit(frame);
      return;
    }

    switch (frame.type) {
      case FRAME_TYPES.SUBSCRIBE:
        this.handleSubscribe(frame);
        break;
      case FRAME_TYPES.UNSUBSCRIBE:
        this.handleUnsubscribe(frame);
        break;
      default:
        await this.sendError({ code: 'ProtocolError', message: `Unknown frame type: ${frame.type}` });
    }
  }

  async handleConnectionInit(_frame) {
    clearTimeout(this.connectionInitTimeout);

    try {
      // const credentials = frame.authorization ? decryptToken(frame.authorization) : null;
      // const authClient = this.authFactory({ credentials });
      // const scopes = await authClient.currentScopes();
      // const satisfyingScopes = scopeUtils.scopesSatisfying(scopes.scopes, { AllOf: ['web:read-pulse'] });

      // if (!satisfyingScopes) {
      //   const message = [
      //     `Error: InsufficientScopes`,
      //     '',
      //     `Client ID ${credentials?.clientId ?? 'anonymous'} does not have sufficient scopes and is missing the following scopes:`,
      //     '',
      //     '```',
      //     'web:read-pulse',
      //     '```',
      //   ].join('\n');

      //   await this.sendError({
      //     code: 'InsufficientScopes',
      //     message,
      //     details: { required: ['web:read-pulse'] },
      //   });
      //   this.close(CLOSE_CODES.INSUFFICIENT_SCOPES, 'InsufficientScopes');
      //   return;
      // }

      this.connectionInitReceived = true;
      //this.clientId = credentials?.clientId ?? 'anonymous';
      this.clientId = 'anonymous';
      this.monitor.log.websocketConnected({ clientId: this.clientId });
      await this.send({ type: FRAME_TYPES.CONNECTION_ACK });
    } catch (err) {
      this.monitor.reportError(err);
      await this.sendError({ code: 'InternalError', message: 'Internal error during authentication', details: {} });
      this.close(CLOSE_CODES.INTERNAL_ERROR, 'Internal error');
    }
  }

  handleSubscribe(frame) {
    let bindings;

    try {
      bindings = resolveBindings(this.kind, frame, this.clients);
    } catch (err) {
      // A malformed subscribe frame is a client error: reject it with an error
      // frame, but keep the connection.
      if (err.code === 'ProtocolError') {
        this.sendError({ code: 'ProtocolError', message: err.message });
        return;
      }

      this.monitor.reportError(err);
      this.sendError({ code: 'InternalError', message: 'Internal error resolving subscription' });
      return;
    }

    // pulseEngine mints the subscriptionId; the delivery callbacks close over
    // it by reference, which is safe because pulseEngine.subscribe returns
    // synchronously and messages are only delivered on a later tick.
    let subscriptionId;

    subscriptionId = this.pulseEngine.subscribe(
      bindings,
      message => {
        // the returned promise drives the engine's AMQP ack/nack
        return this.send({ type: FRAME_TYPES.DATA, subscriptionId, message });
      },
      err => {
        const error = err instanceof Error ? err : new Error(String(err));

        this.monitor.reportError(error);
        this.sendError({ subscriptionId, code: 'SubscriptionError', message: error.message });
      }
    );

    this.subscriptions.add(subscriptionId);
    this.send({ type: FRAME_TYPES.SUBSCRIBE_ACK, subscriptionId }).catch(() => {});
  }

  handleUnsubscribe(frame) {
    const { subscriptionId } = frame;

    if (this.subscriptions.has(subscriptionId)) {
      this.pulseEngine.unsubscribe(subscriptionId);
      this.subscriptions.delete(subscriptionId);
    }
  }
}
