import apis from '@taskcluster/client/src/apis.js';

// Resolve a subscribe frame into the `{ exchange, pattern }` bindings the pulse
// engine consumes. Each events endpoint fixes the resolver its connections use:
//   - resolveRawBindings (/subscription/raw): `frame.bindings` are already
//     resolved exchanges and patterns — used by the Pulse debugger, which binds
//     arbitrary exchanges;
//   - resolveNamedBindings (/subscription/named): a semantic request (a
//     service's event names plus a routing-key filter) that the server expands
//     into bindings via that service's events client.
//
// A malformed frame throws an Error with `code: 'ProtocolError'`, which the
// connection reports to the client without tearing down the socket.

const protocolError = message => Object.assign(new Error(message), { code: 'ProtocolError' });

const isPlainObject = value => typeof value === 'object' && value !== null && !Array.isArray(value);

// Upper bound on how many bindings/subscriptions a single subscribe frame may
// request, so one connection cannot bind an unbounded number of queues.
const MAX_SUBSCRIPTIONS = 100;

export const resolveRawBindings = ({ bindings }) => {
  if (!Array.isArray(bindings) || bindings.length === 0) {
    throw protocolError('subscribe requires a non-empty array of bindings');
  }

  if (bindings.length > MAX_SUBSCRIPTIONS) {
    throw protocolError(`subscribe allows at most ${MAX_SUBSCRIPTIONS} bindings`);
  }

  return bindings.map(binding => {
    if (!isPlainObject(binding) || typeof binding.exchange !== 'string' || typeof binding.pattern !== 'string') {
      throw protocolError('each binding requires an `exchange` and a `pattern` string');
    }

    return { exchange: binding.exchange, pattern: binding.pattern };
  });
};

// The services whose pulse events can be subscribed to by name, keyed by the
// `service` a subscribe frame names: the events client that resolves them, and
// the event names it exposes (the topic exchanges of its API reference). Extend
// as more events clients are exposed.
const topicExchanges = ({ reference }) =>
  new Set(reference.entries.filter(entry => entry.type === 'topic-exchange').map(entry => entry.name));

const EVENTS_SERVICES = new Map([
  ['queue', { client: clients => clients.queueEvents, events: topicExchanges(apis.QueueEvents) }],
]);

export const resolveNamedBindings = ({ service, subscriptions, routingKey }, clients) => {
  // `service` is required rather than defaulted: a caller must say whose events
  // it means, so the set of exchanges bound never shifts if a default changes.
  if (typeof service !== 'string') {
    throw protocolError('subscribe requires a `service` string');
  }

  const eventsService = EVENTS_SERVICES.get(service);

  if (!eventsService) {
    throw protocolError(`unknown events service: ${service}`);
  }

  if (!Array.isArray(subscriptions) || subscriptions.length === 0) {
    throw protocolError('subscribe requires a non-empty array of subscriptions');
  }

  if (subscriptions.length > MAX_SUBSCRIPTIONS) {
    throw protocolError(`subscribe allows at most ${MAX_SUBSCRIPTIONS} subscriptions`);
  }

  // an omitted routing key matches everything
  if (routingKey != null && !isPlainObject(routingKey)) {
    throw protocolError('routingKey must be an object of routing-key fields');
  }

  const eventsClient = eventsService.client(clients);

  return subscriptions.map(eventName => {
    if (!eventsService.events.has(eventName)) {
      throw protocolError(`unknown ${service} event: ${eventName}`);
    }

    let binding;

    try {
      binding = eventsClient[eventName](routingKey);
    } catch (err) {
      // the events client asserts on routing-key values it cannot encode, such
      // as a dot in a single-word field
      throw protocolError(`invalid routingKey for ${service} event ${eventName}: ${err.message}`);
    }

    return { exchange: binding.exchange, pattern: binding.routingKeyPattern };
  });
};
