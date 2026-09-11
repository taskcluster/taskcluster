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

beforeEach(() => {
  window.env = {
    GRAPHQL_SUBSCRIPTION_ENDPOINT: 'http://localhost/subscription',
  };
  vi.stubGlobal('WebSocket', FakeWebSocket);
});

afterEach(() => {
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
