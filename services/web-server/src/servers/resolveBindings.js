// Resolve a subscribe frame into the `{ exchange, pattern }` bindings the
// pulse engine consumes. Each events endpoint fixes the `kind` used for its
// connections:
//   - 'raw' (/events/raw): `frame.bindings` are already resolved exchanges
//     and patterns — used by the Pulse debugger, which binds arbitrary
//     exchanges;
//   - 'named' (/events/named): a semantic request (a service's event names
//     plus a routing-key filter) that the server expands into bindings via
//     that service's events client.
//
// A malformed frame throws an Error with `code: 'ProtocolError'`, which the
// connection reports to the client without tearing down the socket.

const protocolError = message => Object.assign(new Error(message), { code: 'ProtocolError' });

export default (kind, frame, clients) => {
  switch (kind) {
    case 'raw':
      return frame.bindings;
    case 'named': {
      const { service = 'queue', subscriptions, routingKey } = frame;
      // one entry per service whose pulse events can be subscribed by name;
      // extend as more events clients are exposed
      const eventsClient = {
        queue: clients.queueEvents,
      }[service];

      if (!eventsClient) {
        throw protocolError(`unknown events service: ${service}`);
      }

      if (!Array.isArray(subscriptions) || subscriptions.length === 0) {
        throw protocolError('subscribe requires a non-empty array of subscriptions');
      }

      return subscriptions.map(eventName => {
        // exchange methods live directly on the generated client's prototype;
        // anything else reachable on the instance (inherited Object.prototype
        // members, the constructor) is not an event
        const isEvent =
          typeof eventName === 'string' &&
          eventName !== 'constructor' &&
          Object.hasOwn(Object.getPrototypeOf(eventsClient), eventName);

        if (!isEvent) {
          throw protocolError(`unknown ${service} event: ${eventName}`);
        }

        const binding = eventsClient[eventName](routingKey ?? {});

        return { exchange: binding.exchange, pattern: binding.routingKeyPattern };
      });
    }
    default:
      // kinds are fixed per-endpoint by the server, never taken from the
      // frame, so an unknown kind is a server bug
      throw new Error(`unknown endpoint kind: ${kind}`);
  }
};
