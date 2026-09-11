import subscribeToPulseMessages from './pulseListener';

// A fake Apollo client that captures the subscription request and exposes the
// observer callbacks so tests can drive `next` / `error`.
const makeFakeClient = () => {
  const unsubscribe = vi.fn();
  const captured = {};

  const client = {
    subscribe: vi.fn(request => {
      captured.request = request;

      return {
        subscribe: ({ next, error }) => {
          captured.next = next;
          captured.error = error;

          return { unsubscribe };
        },
      };
    }),
  };

  return { client, captured, unsubscribe };
};

describe('subscribeToPulseMessages', () => {
  it('normalizes routingKeyPattern bindings to { exchange, pattern } and drops __typename', () => {
    const { client, captured } = makeFakeClient();

    subscribeToPulseMessages(
      client,
      [
        {
          exchange: 'exchange/foo/v1/thing',
          routingKeyPattern: '#.bar.#',
          __typename: 'PulseBinding',
        },
      ],
      { onMessage: vi.fn(), onError: vi.fn() }
    );

    expect(captured.request.variables.subscriptions).toEqual([
      { exchange: 'exchange/foo/v1/thing', pattern: '#.bar.#' },
    ]);
  });

  it('accepts pattern-shaped bindings unchanged (PulseMessages view)', () => {
    const { client, captured } = makeFakeClient();

    subscribeToPulseMessages(
      client,
      [{ exchange: 'exchange/foo/v1/thing', pattern: '#' }],
      { onMessage: vi.fn(), onError: vi.fn() }
    );

    expect(captured.request.variables.subscriptions).toEqual([
      { exchange: 'exchange/foo/v1/thing', pattern: '#' },
    ]);
  });

  it('strips the envelope top-level __typename but preserves __typename inside the payload', () => {
    const { client, captured } = makeFakeClient();
    const onMessage = vi.fn();

    subscribeToPulseMessages(
      client,
      [{ exchange: 'e', routingKeyPattern: '#' }],
      { onMessage, onError: vi.fn() }
    );

    captured.next({
      data: {
        pulseMessages: {
          __typename: 'PulseMessage',
          exchange: 'e',
          routingKey: 'rk',
          payload: { __typename: 'not-graphql', value: 1 },
        },
      },
    });

    const delivered = onMessage.mock.calls[0][0];

    expect(delivered.__typename).toBeUndefined();
    expect(delivered.exchange).toBe('e');
    // the payload is the raw message body and must NOT be recursively stripped
    expect(delivered.payload).toEqual({ __typename: 'not-graphql', value: 1 });
  });

  it('forwards subscription errors to onError', () => {
    const { client, captured } = makeFakeClient();
    const onError = vi.fn();
    const err = new Error('boom');

    subscribeToPulseMessages(client, [{ exchange: 'e', pattern: '#' }], {
      onMessage: vi.fn(),
      onError,
    });

    captured.error(err);

    expect(onError).toHaveBeenCalledWith(err);
  });

  it('returns a teardown fn that unsubscribes the observer', () => {
    const { client, unsubscribe } = makeFakeClient();

    const teardown = subscribeToPulseMessages(
      client,
      [{ exchange: 'e', pattern: '#' }],
      { onMessage: vi.fn(), onError: vi.fn() }
    );

    expect(unsubscribe).not.toHaveBeenCalled();
    teardown();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
