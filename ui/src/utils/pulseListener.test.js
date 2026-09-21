import subscribeToPulseMessages, {
  subscribeToNamedEvents,
} from './pulseListener';

// A minimal WebSocket stub that lets tests drive the protocol.
class FakeWebSocket {
  constructor(url) {
    this.url = url;
    this.sent = [];
    this.readyState = FakeWebSocket.CONNECTING;
    FakeWebSocket._lastInstance = this;
  }

  send(data) {
    this.sent.push(JSON.parse(data));
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose({ wasClean: true, code: 1000 });
    }
  }

  simulateOpen() {
    this.readyState = FakeWebSocket.OPEN;
    if (this.onopen) {
      this.onopen();
    }
  }

  simulateMessage(frame) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(frame) });
    }
  }

  simulateError() {
    if (this.onerror) {
      this.onerror(new Event('error'));
    }
  }

  simulateClose(code = 1006, wasClean = false) {
    this.readyState = FakeWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose({ code, wasClean });
    }
  }
}

FakeWebSocket.CONNECTING = 0;
FakeWebSocket.OPEN = 1;
FakeWebSocket.CLOSING = 2;
FakeWebSocket.CLOSED = 3;

// Drain settled promises without depending on the exact depth of the
// listener's onopen promise chain.
const flushPromises = async () => {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
};

beforeEach(() => {
  window.env = {
    GRAPHQL_SUBSCRIPTION_ENDPOINT: 'http://localhost/subscription',
  };
  vi.stubGlobal('WebSocket', FakeWebSocket);
  // Reconnection is scheduled with setTimeout; fake timers keep those pending
  // reconnects from leaking real sockets across tests, and let reconnect tests
  // advance to the retry deterministically.
  vi.useFakeTimers();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('subscribeToPulseMessages', () => {
  it('connects to the raw events endpoint', () => {
    subscribeToPulseMessages([{ exchange: 'e', pattern: '#' }], {
      onMessage: vi.fn(),
      onError: vi.fn(),
    });

    expect(FakeWebSocket._lastInstance.url).toBe(
      'ws://localhost/subscription/raw'
    );
  });

  it('sends connection_init on open', () => {
    subscribeToPulseMessages([{ exchange: 'e', pattern: '#' }], {
      onMessage: vi.fn(),
      onError: vi.fn(),
    });

    const ws = FakeWebSocket._lastInstance;

    ws.simulateOpen();

    expect(ws.sent[0]).toEqual({ type: 'connection_init' });
  });

  it('normalizes routingKeyPattern bindings to { exchange, pattern }', () => {
    subscribeToPulseMessages(
      [
        {
          exchange: 'exchange/foo/v1/thing',
          routingKeyPattern: '#.bar.#',
          __typename: 'PulseBinding',
        },
      ],
      { onMessage: vi.fn(), onError: vi.fn() }
    );

    const ws = FakeWebSocket._lastInstance;

    ws.simulateOpen();
    ws.simulateMessage({ type: 'connection_ack' });

    const subscribeFrame = ws.sent.find(f => f.type === 'subscribe');

    expect(subscribeFrame.bindings).toEqual([
      { exchange: 'exchange/foo/v1/thing', pattern: '#.bar.#' },
    ]);
    // The server mints the subscriptionId; the client must not send one.
    expect(subscribeFrame).not.toHaveProperty('subscriptionId');
    // The endpoint fixes how the frame is interpreted; there is no kind field.
    expect(subscribeFrame).not.toHaveProperty('kind');
  });

  it('accepts pattern-shaped bindings unchanged (PulseMessages view)', () => {
    subscribeToPulseMessages(
      [{ exchange: 'exchange/foo/v1/thing', pattern: '#' }],
      { onMessage: vi.fn(), onError: vi.fn() }
    );

    const ws = FakeWebSocket._lastInstance;

    ws.simulateOpen();
    ws.simulateMessage({ type: 'connection_ack' });

    const subscribeFrame = ws.sent.find(f => f.type === 'subscribe');

    expect(subscribeFrame.bindings).toEqual([
      { exchange: 'exchange/foo/v1/thing', pattern: '#' },
    ]);
  });

  it('calls onMessage with the message from data frames', () => {
    const onMessage = vi.fn();
    const msg = {
      exchange: 'e',
      routingKey: 'rk',
      payload: { value: 1 },
      redelivered: false,
      cc: [],
    };

    subscribeToPulseMessages([{ exchange: 'e', pattern: '#' }], {
      onMessage,
      onError: vi.fn(),
    });

    const ws = FakeWebSocket._lastInstance;

    ws.simulateOpen();
    ws.simulateMessage({ type: 'connection_ack' });
    ws.simulateMessage({ type: 'subscribe_ack', subscriptionId: 'srv-1' });
    ws.simulateMessage({ type: 'data', subscriptionId: 'srv-1', message: msg });

    expect(onMessage).toHaveBeenCalledWith(msg);
  });

  it('calls onError when an error frame is received', () => {
    const onError = vi.fn();

    subscribeToPulseMessages([{ exchange: 'e', pattern: '#' }], {
      onMessage: vi.fn(),
      onError,
    });

    const ws = FakeWebSocket._lastInstance;

    ws.simulateOpen();
    ws.simulateMessage({ type: 'connection_ack' });
    ws.simulateMessage({
      type: 'error',
      code: 'SubscriptionError',
      message: 'boom',
    });

    expect(onError).toHaveBeenCalledWith(new Error('boom'));
  });

  it('calls onError on WebSocket error', () => {
    const onError = vi.fn();

    subscribeToPulseMessages([{ exchange: 'e', pattern: '#' }], {
      onMessage: vi.fn(),
      onError,
    });

    FakeWebSocket._lastInstance.simulateError();

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('calls onError on unexpected close', () => {
    const onError = vi.fn();

    subscribeToPulseMessages([{ exchange: 'e', pattern: '#' }], {
      onMessage: vi.fn(),
      onError,
    });

    FakeWebSocket._lastInstance.simulateClose(1006, false);

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('returns a teardown fn that sends unsubscribe and closes', () => {
    const teardown = subscribeToPulseMessages(
      [{ exchange: 'e', pattern: '#' }],
      { onMessage: vi.fn(), onError: vi.fn() }
    );

    const ws = FakeWebSocket._lastInstance;

    ws.simulateOpen();
    ws.simulateMessage({ type: 'connection_ack' });
    ws.simulateMessage({ type: 'subscribe_ack', subscriptionId: 'srv-1' });

    teardown();

    const unsubFrame = ws.sent.find(f => f.type === 'unsubscribe');

    expect(unsubFrame).toEqual({
      type: 'unsubscribe',
      subscriptionId: 'srv-1',
    });
    expect(ws.readyState).toBe(FakeWebSocket.CLOSED);
  });

  it('tears down without sending unsubscribe when no id was assigned yet', () => {
    const teardown = subscribeToPulseMessages(
      [{ exchange: 'e', pattern: '#' }],
      { onMessage: vi.fn(), onError: vi.fn() }
    );

    const ws = FakeWebSocket._lastInstance;

    ws.simulateOpen();
    ws.simulateMessage({ type: 'connection_ack' });

    // Teardown before subscribe_ack arrives: no id to unsubscribe, just close.
    teardown();

    expect(ws.sent.find(f => f.type === 'unsubscribe')).toBeUndefined();
    expect(ws.readyState).toBe(FakeWebSocket.CLOSED);
  });

  it('does not call onError after teardown', () => {
    const onError = vi.fn();
    const teardown = subscribeToPulseMessages(
      [{ exchange: 'e', pattern: '#' }],
      { onMessage: vi.fn(), onError }
    );

    const ws = FakeWebSocket._lastInstance;

    ws.simulateOpen();
    ws.simulateMessage({ type: 'connection_ack' });

    teardown();

    // Simulate a late error/close after deliberate teardown — must be ignored.
    ws.simulateError();
    ws.simulateClose(1006, false);

    expect(onError).not.toHaveBeenCalled();
  });
});

describe('events WebSocket url', () => {
  it('maps an http endpoint to ws', () => {
    window.env = { GRAPHQL_SUBSCRIPTION_ENDPOINT: 'http://host/subscription' };

    subscribeToPulseMessages([{ exchange: 'e', pattern: '#' }], {
      onMessage: vi.fn(),
      onError: vi.fn(),
    });

    expect(FakeWebSocket._lastInstance.url).toBe('ws://host/subscription/raw');
  });

  it('preserves a wss endpoint rather than downgrading it to ws', () => {
    window.env = { GRAPHQL_SUBSCRIPTION_ENDPOINT: 'wss://host/subscription' };

    subscribeToPulseMessages([{ exchange: 'e', pattern: '#' }], {
      onMessage: vi.fn(),
      onError: vi.fn(),
    });

    expect(FakeWebSocket._lastInstance.url).toBe('wss://host/subscription/raw');
  });
});

describe('error and reconnection handling', () => {
  it('reports onError only once when a failed connect fires error then close', () => {
    const onError = vi.fn();

    subscribeToPulseMessages([{ exchange: 'e', pattern: '#' }], {
      onMessage: vi.fn(),
      onError,
    });

    const ws = FakeWebSocket._lastInstance;

    // A failed connect fires onerror and then onclose(1006, wasClean:false).
    ws.simulateError();
    ws.simulateClose(1006, false);

    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('reconnects and re-sends the subscribe frame after an unexpected close', () => {
    subscribeToPulseMessages([{ exchange: 'e', pattern: '#' }], {
      onMessage: vi.fn(),
      onError: vi.fn(),
    });

    const first = FakeWebSocket._lastInstance;

    first.simulateOpen();
    first.simulateMessage({ type: 'connection_ack' });
    first.simulateClose(1006, false);

    // The reconnect is scheduled, not immediate.
    expect(FakeWebSocket._lastInstance).toBe(first);

    vi.runOnlyPendingTimers();

    const second = FakeWebSocket._lastInstance;

    expect(second).not.toBe(first);

    second.simulateOpen();
    second.simulateMessage({ type: 'connection_ack' });

    expect(second.sent.find(f => f.type === 'subscribe')).toBeDefined();
  });

  it('gets fresh credentials before reconnecting', async () => {
    const staleCredentials = {
      clientId: 'user',
      accessToken: 'stale-token',
    };
    const freshCredentials = {
      clientId: 'user',
      accessToken: 'fresh-token',
    };
    const getCredentials = vi
      .fn()
      .mockResolvedValueOnce(staleCredentials)
      .mockResolvedValueOnce(freshCredentials);

    subscribeToPulseMessages([{ exchange: 'e', pattern: '#' }], {
      onMessage: vi.fn(),
      onError: vi.fn(),
      getCredentials,
    });

    const first = FakeWebSocket._lastInstance;

    first.simulateOpen();
    await vi.waitFor(() => expect(first.sent).toHaveLength(1));

    expect(first.sent[0]).toEqual({
      type: 'connection_init',
      authorization: `Bearer ${btoa(JSON.stringify(staleCredentials))}`,
    });

    first.simulateClose(4408, true);
    vi.runOnlyPendingTimers();

    const second = FakeWebSocket._lastInstance;

    second.simulateOpen();
    await vi.waitFor(() => expect(second.sent).toHaveLength(1));

    expect(getCredentials).toHaveBeenCalledTimes(2);
    expect(second.sent[0]).toEqual({
      type: 'connection_init',
      authorization: `Bearer ${btoa(JSON.stringify(freshCredentials))}`,
    });
  });

  it('does not send credentials after teardown while renewal is pending', async () => {
    let resolveCredentials;
    const getCredentials = vi.fn(
      () =>
        new Promise(resolve => {
          resolveCredentials = resolve;
        })
    );
    const teardown = subscribeToPulseMessages(
      [{ exchange: 'e', pattern: '#' }],
      {
        onMessage: vi.fn(),
        onError: vi.fn(),
        getCredentials,
      }
    );
    const ws = FakeWebSocket._lastInstance;

    ws.simulateOpen();
    await flushPromises();
    teardown();
    resolveCredentials({ clientId: 'user', accessToken: 'fresh-token' });
    await flushPromises();

    expect(ws.sent).toEqual([]);
  });

  it('stops reconnecting after teardown', () => {
    const teardown = subscribeToPulseMessages(
      [{ exchange: 'e', pattern: '#' }],
      { onMessage: vi.fn(), onError: vi.fn() }
    );

    const first = FakeWebSocket._lastInstance;

    first.simulateOpen();
    first.simulateMessage({ type: 'connection_ack' });

    teardown();
    first.simulateClose(1006, false);
    vi.runOnlyPendingTimers();

    // No new socket was opened by a reconnect.
    expect(FakeWebSocket._lastInstance).toBe(first);
  });

  it('does not reconnect after authentication failure, and surfaces the error', () => {
    const onError = vi.fn();

    subscribeToPulseMessages([{ exchange: 'e', pattern: '#' }], {
      onMessage: vi.fn(),
      onError,
    });

    const first = FakeWebSocket._lastInstance;

    first.simulateOpen();
    // The server sends an error frame, then closes with the auth-failure code.
    first.simulateMessage({
      type: 'error',
      code: 'AuthenticationFailed',
      message: 'Authentication failed: credentials are invalid or expired',
    });
    first.simulateClose(4401, true);
    vi.runOnlyPendingTimers();

    expect(onError).toHaveBeenCalledWith(
      new Error('Authentication failed: credentials are invalid or expired')
    );
    // The captured credentials are stale; retrying cannot succeed.
    expect(FakeWebSocket._lastInstance).toBe(first);
  });

  it('reconnects after the connection lifetime expires', () => {
    subscribeToPulseMessages([{ exchange: 'e', pattern: '#' }], {
      onMessage: vi.fn(),
      onError: vi.fn(),
    });

    const first = FakeWebSocket._lastInstance;

    first.simulateOpen();
    first.simulateClose(4408, true);
    vi.runOnlyPendingTimers();

    expect(FakeWebSocket._lastInstance).not.toBe(first);
  });

  it('does not reconnect after an insufficient-scopes close', () => {
    subscribeToPulseMessages([{ exchange: 'e', pattern: '#' }], {
      onMessage: vi.fn(),
      onError: vi.fn(),
    });

    const first = FakeWebSocket._lastInstance;

    first.simulateOpen();
    first.simulateClose(4403, true);
    vi.runOnlyPendingTimers();

    expect(FakeWebSocket._lastInstance).toBe(first);
  });
});

describe('subscribeToNamedEvents', () => {
  it('connects to the named events endpoint', () => {
    subscribeToNamedEvents(
      { subscriptions: ['taskDefined'], routingKey: { taskId: 't-1' } },
      { onMessage: vi.fn(), onError: vi.fn() }
    );

    expect(FakeWebSocket._lastInstance.url).toBe(
      'ws://localhost/subscription/named'
    );
  });

  it('sends the event names and routing key after connection_ack', () => {
    subscribeToNamedEvents(
      {
        subscriptions: ['taskDefined', 'taskCompleted'],
        routingKey: { taskId: 't-1' },
      },
      { onMessage: vi.fn(), onError: vi.fn() }
    );

    const ws = FakeWebSocket._lastInstance;

    ws.simulateOpen();
    ws.simulateMessage({ type: 'connection_ack' });

    const subscribeFrame = ws.sent.find(f => f.type === 'subscribe');

    expect(subscribeFrame).toEqual({
      type: 'subscribe',
      subscriptions: ['taskDefined', 'taskCompleted'],
      routingKey: { taskId: 't-1' },
    });
  });

  it('passes an explicit service through to the subscribe frame', () => {
    subscribeToNamedEvents(
      { service: 'queue', subscriptions: ['taskDefined'], routingKey: {} },
      { onMessage: vi.fn(), onError: vi.fn() }
    );

    const ws = FakeWebSocket._lastInstance;

    ws.simulateOpen();
    ws.simulateMessage({ type: 'connection_ack' });

    const subscribeFrame = ws.sent.find(f => f.type === 'subscribe');

    expect(subscribeFrame.service).toBe('queue');
  });

  it('delivers data frames to onMessage', () => {
    const onMessage = vi.fn();
    const msg = {
      exchange: 'exchange/taskcluster-queue/v1/task-defined',
      routingKey: 'rk',
      payload: { status: { taskId: 't-1' } },
      redelivered: false,
      cc: [],
    };

    subscribeToNamedEvents(
      { subscriptions: ['taskDefined'], routingKey: { taskId: 't-1' } },
      { onMessage, onError: vi.fn() }
    );

    const ws = FakeWebSocket._lastInstance;

    ws.simulateOpen();
    ws.simulateMessage({ type: 'connection_ack' });
    ws.simulateMessage({ type: 'subscribe_ack', subscriptionId: 'srv-1' });
    ws.simulateMessage({ type: 'data', subscriptionId: 'srv-1', message: msg });

    expect(onMessage).toHaveBeenCalledWith(msg);
  });
});
