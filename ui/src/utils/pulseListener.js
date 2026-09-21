// Hook bindings use `routingKeyPattern`; the PulseMessages view uses `pattern`.
// Both are normalized to the `{ exchange, pattern }` shape the events server expects.
const toSubscriptions = bindings =>
  bindings.map(({ exchange, pattern, routingKeyPattern }) => ({
    exchange,
    pattern: pattern ?? routingKeyPattern,
  }));

const getEventsWsUrl = endpointPath => {
  // The env var is the base ('/subscription'); each subscription shape has its
  // own endpoint under it ('raw' or 'named'). Resolves against the current
  // origin when relative (dev: proxied by Vite) and is used as-is when absolute
  // (deployed: 'https://host/subscription').
  const base = window.env?.GRAPHQL_SUBSCRIPTION_ENDPOINT || '/subscription';
  const url = new URL(
    `${base.replace(/\/$/, '')}/${endpointPath}`,
    window.location.href
  );

  // Map http(s) -> ws(s); a same-origin relative path inherits the page
  // protocol. A map (rather than an https/else check) leaves an endpoint that
  // is already given as ws:/wss: untouched instead of downgrading wss -> ws.
  const websocketProtocols = {
    'https:': 'wss:',
    'http:': 'ws:',
    'wss:': 'wss:',
    'ws:': 'ws:',
  };

  url.protocol = websocketProtocols[url.protocol] ?? url.protocol;

  return url.toString();
};

// Reconnect backoff: the old Apollo subscription link reconnected on drop, so
// the events socket does too. Backs off exponentially from 1s up to 30s, reset
// once a connection is acknowledged.
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;

// The server closes with this code after rejecting connection_init for missing
// the `web:read-pulse` scope. Retrying with the same credentials cannot
// succeed, so it does not schedule a reconnect.
const CLOSE_INSUFFICIENT_SCOPES = 4403;

// The server closes with this code after rejecting connection_init because the
// latest available credentials were still invalid or expired. Repeating that
// attempt cannot succeed, so stop rather than spamming the server. The error
// frame that precedes this close has already reached onError.
const CLOSE_AUTHENTICATION_FAILED = 4401;

const NO_RECONNECT_CLOSE_CODES = new Set([
  CLOSE_INSUFFICIENT_SCOPES,
  CLOSE_AUTHENTICATION_FAILED,
]);

// The server authenticates on the connection_init frame rather than the HTTP
// upgrade. The token is the same shape the HTTP GraphQL link sends in its
// Authorization header; an anonymous user sends a bare connection_init and is
// checked against the anonymous role's scopes.
const connectionInitFrame = credentials =>
  credentials
    ? {
        type: 'connection_init',
        authorization: `Bearer ${btoa(JSON.stringify(credentials))}`,
      }
    : { type: 'connection_init' };

/**
 * Open the events WebSocket at the given endpoint ('raw' or 'named'), and once
 * the connection is acknowledged send the given subscribe frame. Handles the
 * connection_init/ack handshake, delivery, errors, reconnection, and teardown
 * that every subscription shape shares. On an unexpected drop the socket
 * reconnects with backoff and re-sends the subscribe frame. Returns a teardown
 * function that unsubscribes and stops reconnecting.
 *
 * `getCredentials` obtains current credentials before every connection_init,
 * allowing a reconnect to renew short-lived credentials. `user` is retained
 * as a fallback for callers without a credential provider and so callers can
 * still tear down and resubscribe immediately when the signed-in user changes.
 *
 * Authentication rejection stops reconnecting. A caller that later obtains
 * different credentials must subscribe again.
 */
const openEventsSubscription = (
  endpointPath,
  subscribeFrame,
  { onMessage, onError, user, getCredentials }
) => {
  // The events server mints the subscriptionId and returns it in subscribe_ack;
  // it stays null until then. This listener uses a single subscription per
  // socket, so incoming data frames need no per-id routing.
  let ws = null;
  let subscriptionId = null;
  let torn = false;
  let reconnectTimer = null;
  let reconnectAttempts = 0;

  const scheduleReconnect = () => {
    if (torn) {
      return;
    }

    const delay = Math.min(
      RECONNECT_BASE_MS * 2 ** reconnectAttempts,
      RECONNECT_MAX_MS
    );

    reconnectAttempts += 1;
    reconnectTimer = setTimeout(connect, delay);
  };

  function connect() {
    subscriptionId = null;
    // A failed connect fires `onerror` *and* `onclose(1006)`; guard so a single
    // failure reports through onError only once.
    let failureReported = false;
    const socket = new WebSocket(getEventsWsUrl(endpointPath));

    ws = socket;

    const sendConnectionInit = credentials => {
      // Credential renewal can finish after this connection was replaced or
      // the subscription was torn down. Never send on that stale socket.
      if (torn || ws !== socket || socket.readyState !== WebSocket.OPEN) {
        return;
      }

      socket.send(JSON.stringify(connectionInitFrame(credentials)));
    };

    socket.onopen = () => {
      if (!getCredentials) {
        sendConnectionInit(user?.credentials);
        return;
      }

      Promise.resolve()
        .then(() => getCredentials())
        .then(sendConnectionInit)
        .catch(error => {
          if (!torn && ws === socket) {
            failureReported = true;
            onError(error);
            socket.close();
          }
        });
    };

    socket.onmessage = ({ data }) => {
      let frame;

      try {
        frame = JSON.parse(data);
      } catch {
        return;
      }

      switch (frame.type) {
        case 'connection_ack':
          // A live connection resets the backoff, so a later drop retries
          // promptly rather than at the accumulated delay.
          reconnectAttempts = 0;
          socket.send(JSON.stringify(subscribeFrame));
          break;
        case 'subscribe_ack':
          subscriptionId = frame.subscriptionId;
          break;
        case 'data':
          onMessage(frame.message);
          break;
        case 'error':
          onError(new Error(frame.message ?? 'Pulse subscription error'));
          break;
        default:
          break;
      }
    };

    socket.onerror = () => {
      if (!torn && !failureReported) {
        failureReported = true;
        onError(new Error('WebSocket connection error'));
      }
    };

    socket.onclose = event => {
      if (!torn && !event.wasClean && !failureReported) {
        failureReported = true;
        onError(
          new Error(`WebSocket closed unexpectedly (code ${event.code})`)
        );
      }

      // Reconnect after any close we didn't initiate, clean or not, unless the
      // server rejected our credentials outright (missing scope or expired credentials)
      // The error frame that precedes those closes has already reached onError
      if (!torn && !NO_RECONNECT_CLOSE_CODES.has(event.code)) {
        scheduleReconnect();
      }
    };
  }

  connect();

  return () => {
    torn = true;

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }

    // Send an explicit unsubscribe only once the server has assigned an id.
    // If teardown happens before subscribe_ack, closing the socket is enough:
    // the server tears down the connection's subscriptions on close.
    if (subscriptionId && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'unsubscribe', subscriptionId }));
    }
    ws.close();
  };
};

/**
 * Subscribe to Pulse messages arriving on the given raw bindings (each an
 * `{ exchange, pattern }` or `{ exchange, routingKeyPattern }`) via the
 * /subscription/raw endpoint. Used by the Pulse debugger views, which bind arbitrary
 * exchanges directly. `handlers` includes `{ onMessage, onError, user,
 * getCredentials }`; see openEventsSubscription. Returns a teardown function
 * that unsubscribes.
 */
const subscribeToPulseMessages = (bindings, handlers) =>
  openEventsSubscription(
    'raw',
    { type: 'subscribe', bindings: toSubscriptions(bindings) },
    handlers
  );

/**
 * Subscribe to Pulse events by name rather than by raw binding, via the
 * /subscription/named endpoint: the server expands the named events into the
 * matching exchanges, filtered by the routing key. Pass a non-empty
 * `subscriptions` array of event names (e.g. `['taskDefined',
 * 'taskCompleted']`) and a `routingKey` object of fields to match (e.g.
 * `{ taskGroupId }`); omitted routing-key fields are wildcarded. `service`
 * selects whose events the names refer to (e.g. 'queue') and is required — the
 * server rejects a subscribe frame without it. `handlers` includes `{
 * onMessage, onError, user, getCredentials }`; see
 * openEventsSubscription. Returns a teardown function that unsubscribes.
 */
const subscribeToNamedEvents = (
  { service, subscriptions, routingKey },
  handlers
) =>
  openEventsSubscription(
    'named',
    { type: 'subscribe', service, subscriptions, routingKey },
    handlers
  );

export default subscribeToPulseMessages;
export { subscribeToPulseMessages, subscribeToNamedEvents };
