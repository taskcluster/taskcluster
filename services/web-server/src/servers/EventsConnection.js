import scopeUtils from 'taskcluster-lib-scopes';
import { decryptToken } from './decryptToken.js';

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
  constructor({ ws, pulseEngine, clients, authFactory, monitor, socketAliveTimeoutMilliSeconds, connectionInitTimeoutMilliSeconds }) {
    this.ws = ws;
    this.pulseEngine = pulseEngine;
    this.clients = clients;
    this.authFactory = authFactory;
    this.monitor = monitor;
    // engine subscriptionIds owned by this connection
    this.subscriptions = new Set();
    this.connectionInitReceived = false;

    this.lifetimeTimeout = setTimeout(() => {
      this.close(CLOSE_CODES.LIFETIME_EXCEEDED, 'Connection lifetime exceeded');
    }, socketAliveTimeoutMilliSeconds);

    this.connectionInitTimeout = setTimeout(() => {
      this.close(CLOSE_CODES.PROTOCOL_ERROR, 'Protocol error: no connection_init frame received');
    }, connectionInitTimeoutMilliSeconds);

    ws.on('message', data => this.onMessage(data));
    ws.on('close', closeCode => this.onClose(closeCode));
    ws.on('error', err => this.monitor.reportError(err));
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

  async handleConnectionInit(frame) {
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
      bindings = this.resolveBindings(frame);
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
      message => this.deliver(subscriptionId, message),
      err => this.subscriptionError(subscriptionId, err)
    );

    this.subscriptions.add(subscriptionId);
    this.send({ type: FRAME_TYPES.SUBSCRIBE_ACK, subscriptionId }).catch(() => {});
  }

  // Resolve a subscribe frame into the `{ exchange, pattern }` bindings the
  // pulse engine consumes. `kind` selects how the frame is interpreted:
  //   - 'raw' (or absent): `frame.bindings` are already resolved exchanges and
  //     patterns — used by the Pulse debugger, which binds arbitrary exchanges;
  //   - 'tasks': a semantic request (event names + a routing-key filter) that
  //     the server expands into bindings via the QueueEvents client.
  resolveBindings(frame) {
    const kind = frame.kind ?? 'raw';

    switch (kind) {
      case 'raw':
        return frame.bindings;
      case 'tasks': {
        const { subscriptions, routingKey } = frame;

        if (!Array.isArray(subscriptions) || subscriptions.length === 0) {
          throw Object.assign(new Error('subscribe requires a non-empty array of subscriptions'), { code: 'ProtocolError' });
        }

        return subscriptions.map(eventName => {
          const binding = this.clients.queueEvents[eventName](routingKey ?? {});

          return { exchange: binding.exchange, pattern: binding.routingKeyPattern };
        });
      }
      default:
        throw Object.assign(new Error(`unknown subscribe kind: ${kind}`), { code: 'ProtocolError' });
    }
  }

  handleUnsubscribe(frame) {
    const { subscriptionId } = frame;

    if (this.subscriptions.has(subscriptionId)) {
      this.pulseEngine.unsubscribe(subscriptionId);
      this.subscriptions.delete(subscriptionId);
    }
  }

  deliver(subscriptionId, message) {
    return this.send({ type: FRAME_TYPES.DATA, subscriptionId, message });
  }

  subscriptionError(subscriptionId, err) {
    const error = err instanceof Error ? err : new Error(String(err));
    this.monitor.reportError(error);
    this.sendError({
      subscriptionId,
      code: 'SubscriptionError',
      message: error.message,
    });
  }

  onClose(closeCode) {
    clearTimeout(this.lifetimeTimeout);
    clearTimeout(this.connectionInitTimeout);

    const openSubscriptions = this.subscriptions.size;

    for (const subscriptionId of this.subscriptions) {
      this.pulseEngine.unsubscribe(subscriptionId);
    }
    this.subscriptions.clear();

    this.monitor.log.websocketClosed({ closeCode, openSubscriptions });
  }
}
