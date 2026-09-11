import pulseMessagesQuery from './pulseMessages.graphql';

// Hook bindings use `routingKeyPattern`; the PulseMessages view uses `pattern`.
// Both are normalized to the `{ exchange, pattern }` shape the GraphQL
// `PulseSubscription` input expects, dropping any `__typename`.
const toSubscriptions = bindings =>
  bindings.map(({ exchange, pattern, routingKeyPattern }) => ({
    exchange,
    pattern: pattern ?? routingKeyPattern,
  }));

// Strip only the envelope's top-level `__typename`, not any inside `payload`: a
// Pulse payload may legitimately contain a `__typename` and must be validated
// as-is, matching what the Hooks service validates.
const stripEnvelopeTypename = message => {
  const { __typename, ...rest } = message;

  return rest;
};

/**
 * Subscribe to Pulse messages arriving on the given bindings. Returns a
 * teardown function that unsubscribes.
 */
const subscribeToPulseMessages = (client, bindings, { onMessage, onError }) => {
  const observer = client
    .subscribe({
      query: pulseMessagesQuery,
      variables: {
        subscriptions: toSubscriptions(bindings),
      },
    })
    .subscribe({
      next: ({ data: { pulseMessages } }) => {
        onMessage(stripEnvelopeTypename(pulseMessages));
      },
      error: error => {
        onError(error);
      },
    });

  return () => observer.unsubscribe();
};

export default subscribeToPulseMessages;
export { subscribeToPulseMessages };
