// Resolve a subscribe frame into the `{ exchange, pattern }` bindings the
// pulse engine consumes. `kind` selects how the frame is interpreted:
//   - 'raw' (or absent): `frame.bindings` are already resolved exchanges and
//     patterns — used by the Pulse debugger, which binds arbitrary exchanges;
//   - 'tasks': a semantic request (event names + a routing-key filter) that
//     the server expands into bindings via the QueueEvents client.
//
// A malformed frame throws an Error with `code: 'ProtocolError'`, which the
// connection reports to the client without tearing down the socket.
export default (frame, { queueEvents }) => {
  const kind = frame.kind ?? 'raw';

  switch (kind) {
    case 'raw':
      return frame.bindings;
    case 'tasks': {
      const { subscriptions, routingKey } = frame;

      if (!Array.isArray(subscriptions) || subscriptions.length === 0) {
        throw Object.assign(new Error('subscribe requires a non-empty array of subscriptions'), {
          code: 'ProtocolError',
        });
      }

      return subscriptions.map(eventName => {
        const binding = queueEvents[eventName](routingKey ?? {});

        return { exchange: binding.exchange, pattern: binding.routingKeyPattern };
      });
    }
    default:
      throw Object.assign(new Error(`unknown subscribe kind: ${kind}`), { code: 'ProtocolError' });
  }
};
