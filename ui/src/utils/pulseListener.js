// Hook bindings use `routingKeyPattern`; the PulseMessages view uses `pattern`.
// Both are normalized to the `{ exchange, pattern }` shape the events server expects.
const toSubscriptions = bindings =>
  bindings.map(({ exchange, pattern, routingKeyPattern }) => ({
    exchange,
    pattern: pattern ?? routingKeyPattern,
  }));

const getEventsWsUrl = () => {
  // Resolves against the current origin when relative (dev: '/events', proxied
  // by Vite) and is used as-is when absolute (deployed: 'https://host/events').
  const endpoint = window.env?.EVENT_WEBSOCKET_ENDPOINT || '/events';
  const url = new URL(endpoint, window.location.href);

  // http(s) -> ws(s); a same-origin relative path inherits the page protocol.
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';

  return url.toString();
};

/**
 * Open the events WebSocket, and once the connection is acknowledged send the
 * given subscribe frame. Handles the connection_init/ack handshake, delivery,
 * errors, and teardown that every subscription shape shares. Returns a teardown
 * function that unsubscribes.
 */
const openEventsSubscription = (subscribeFrame, { onMessage, onError }) => {
  const ws = new WebSocket(getEventsWsUrl());
  // The events server mints the subscriptionId and returns it in subscribe_ack;
  // it stays null until then. This listener uses a single subscription per
  // socket, so incoming data frames need no per-id routing.
  let subscriptionId = null;
  let torn = false;

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'connection_init' }));
  };

  ws.onmessage = ({ data }) => {
    let frame;

    try {
      frame = JSON.parse(data);
    } catch {
      return;
    }

    switch (frame.type) {
      case 'connection_ack':
        ws.send(JSON.stringify(subscribeFrame));
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

  ws.onerror = () => {
    if (!torn) {
      onError(new Error('WebSocket connection error'));
    }
  };

  ws.onclose = event => {
    if (!torn && !event.wasClean) {
      onError(new Error(`WebSocket closed unexpectedly (code ${event.code})`));
    }
  };

  return () => {
    torn = true;
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
 * `{ exchange, pattern }` or `{ exchange, routingKeyPattern }`) via the native
 * WebSocket events endpoint. Used by the Pulse debugger views, which bind
 * arbitrary exchanges directly. Returns a teardown function that unsubscribes.
 */
const subscribeToPulseMessages = (bindings, handlers) =>
  openEventsSubscription(
    { type: 'subscribe', kind: 'raw', bindings: toSubscriptions(bindings) },
    handlers
  );

/**
 * Subscribe to Pulse events by intent rather than by raw binding: the server
 * expands the named events into the matching exchanges, filtered by the routing
 * key. Pass a non-empty `subscriptions` array of event names (e.g.
 * `['taskDefined', 'taskCompleted']`) and a `routingKey` object of fields to
 * match (e.g. `{ taskGroupId }`); omitted routing-key fields are wildcarded.
 * Returns a teardown function that unsubscribes.
 */
const subscribeToTaskEvents = ({ subscriptions, routingKey }, handlers) =>
  openEventsSubscription(
    { type: 'subscribe', kind: 'tasks', subscriptions, routingKey },
    handlers
  );

export default subscribeToPulseMessages;
export { subscribeToPulseMessages, subscribeToTaskEvents };
