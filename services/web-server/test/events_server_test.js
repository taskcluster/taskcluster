import assert from 'node:assert';
import http from 'node:http';
import WebSocket from 'ws';
import testing from '@taskcluster/lib-testing';
import helper from './helper.js';
import clientFactory from '../src/clients.js';
import createEventsServer from '../src/servers/createEventsServer.js';

// Stands in for the PulseEngine: records the bindings each subscription asked
// for and lets tests drive the delivery and error callbacks it registered.
class FakePulseEngine {
  constructor() {
    this.reset();
  }

  reset() {
    this.subscriptions = new Map();
    this.unsubscribed = [];
    this.nextId = 0;
  }

  subscribe(bindings, handleMessage, handleError) {
    const subscriptionId = `sub-${++this.nextId}`;

    this.subscriptions.set(subscriptionId, { bindings, handleMessage, handleError });

    return subscriptionId;
  }

  unsubscribe(subscriptionId) {
    this.unsubscribed.push(subscriptionId);
    this.subscriptions.delete(subscriptionId);
  }
}

suite(testing.suiteName(), () => {
  const bindings = [{ exchange: 'exchange/foo/v1/bar', pattern: 'a.#' }];
  const pulseEngine = new FakePulseEngine();
  let monitor;
  let server;
  let wss;
  let baseUrl;

  suiteSetup(async () => {
    monitor = await helper.load('monitor');
    server = http.createServer();
    wss = createEventsServer({
      cfg: { server: { socketAliveTimeoutMilliSeconds: 60000 } },
      server,
      pulseEngine,
      clients: clientFactory({ rootUrl: 'https://tc.example.com' }),
      authFactory: null,
      monitor,
    });

    await new Promise(resolve => {
      server.listen(0, '127.0.0.1', resolve);
    });
    baseUrl = `ws://127.0.0.1:${server.address().port}`;
  });

  suiteTeardown(async () => {
    wss.close();
    await new Promise(resolve => {
      server.close(resolve);
      server.closeAllConnections();
    });
  });

  setup(() => {
    pulseEngine.reset();
  });

  // The server notices a close slightly after the client does; wait for it,
  // since that is when subscriptions are released and the close is logged.
  const serverSideClosed = () =>
    testing.poll(
      async () => {
        assert.equal(wss.clients.size, 0);
      },
      50,
      10
    );

  // every test closes its socket(s); make sure the server has caught up before
  // the monitor's messages are checked and reset
  teardown(serverSideClosed);

  const messagesOfType = type => monitor.manager.messages.filter(({ Type }) => Type === type);

  // Open a client socket to the given endpoint. Received frames are handed out
  // in order by `nextFrame`; `closed` resolves with the close code and reason.
  const connect = async endpoint => {
    const ws = new WebSocket(`${baseUrl}${endpoint}`);
    const received = [];
    const waiting = [];

    ws.on('message', data => {
      const frame = JSON.parse(data.toString());
      const waiter = waiting.shift();

      if (waiter) {
        waiter(frame);
      } else {
        received.push(frame);
      }
    });

    const closed = new Promise(resolve => {
      ws.on('close', (code, reason) => {
        resolve({ code, reason: reason.toString() });
      });
    });

    await new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });
    // from here on, trouble shows up as a close code, which is what the tests
    // assert on
    ws.on('error', () => {});

    return {
      ws,
      closed,
      send: frame => ws.send(JSON.stringify(frame)),
      nextFrame: () => {
        if (received.length > 0) {
          return Promise.resolve(received.shift());
        }

        return new Promise(resolve => {
          waiting.push(resolve);
        });
      },
      close: () => {
        ws.close();

        return closed;
      },
    };
  };

  const handshake = async endpoint => {
    const conn = await connect(endpoint);

    conn.send({ type: 'connection_init' });
    assert.deepEqual(await conn.nextFrame(), { type: 'connection_ack' });

    return conn;
  };

  const subscribe = async (conn, frame) => {
    conn.send({ type: 'subscribe', ...frame });

    const ack = await conn.nextFrame();
    assert.equal(ack.type, 'subscribe_ack');

    return ack.subscriptionId;
  };

  test('rejects upgrades on unknown paths with a 404', async () => {
    const ws = new WebSocket(`${baseUrl}/subscription/nope`);
    ws.on('error', () => {});

    const statusCode = await new Promise((resolve, reject) => {
      ws.on('unexpected-response', (_req, res) => {
        resolve(res.statusCode);
      });
      ws.on('open', () => {
        reject(new Error('upgrade should not have succeeded'));
      });
    });

    assert.equal(statusCode, 404);
  });

  test('closes with a protocol error when the first frame is not connection_init', async () => {
    const conn = await connect('/subscription/raw');

    conn.send({ type: 'subscribe', bindings });

    const { code, reason } = await conn.closed;
    assert.equal(code, 4400);
    assert.match(reason, /connection_init/);
  });

  test('closes with a protocol error on frames that are not JSON objects with a type', async () => {
    for (const raw of ['not json', '"a string"', JSON.stringify({ notype: 1 })]) {
      const conn = await connect('/subscription/raw');

      conn.ws.send(raw);

      assert.equal((await conn.closed).code, 4400, raw);
    }
  });

  test('acknowledges connection_init and logs the connection', async () => {
    const conn = await handshake('/subscription/raw');

    const connected = messagesOfType('websocket-connected');
    assert.equal(connected.length, 1);
    assert.equal(connected[0].Fields.clientId, 'anonymous');

    await conn.close();
  });

  test('raw subscribe binds the given exchanges and relays delivered messages', async () => {
    const conn = await handshake('/subscription/raw');
    const subscriptionId = await subscribe(conn, { bindings: [{ ...bindings[0], routingKeyPattern: 'ignored' }] });
    const subscription = pulseEngine.subscriptions.get(subscriptionId);

    assert.deepEqual(subscription.bindings, bindings);

    const message = { exchange: bindings[0].exchange, routingKey: 'a.b', payload: { hello: 'world' } };
    // resolves once the frame has been written, which is what acks the AMQP message
    await subscription.handleMessage(message);
    assert.deepEqual(await conn.nextFrame(), { type: 'data', subscriptionId, message });

    await conn.close();
  });

  test('named subscribe expands event names via the events client', async () => {
    const conn = await handshake('/subscription/named');
    const subscriptionId = await subscribe(conn, { subscriptions: ['taskDefined'], routingKey: { taskId: 'abc123' } });
    const [binding] = pulseEngine.subscriptions.get(subscriptionId).bindings;

    assert.match(binding.exchange, /task-defined/);
    assert.match(binding.pattern, /abc123/);

    await conn.close();
  });

  test('a malformed subscribe gets an error frame and keeps the connection usable', async () => {
    const conn = await handshake('/subscription/raw');

    conn.send({ type: 'subscribe', bindings: [] });

    const error = await conn.nextFrame();
    assert.equal(error.type, 'error');
    assert.equal(error.code, 'ProtocolError');
    assert.equal(pulseEngine.subscriptions.size, 0);

    await subscribe(conn, { bindings });
    assert.equal(pulseEngine.subscriptions.size, 1);

    await conn.close();
  });

  test('an unknown frame type gets an error frame', async () => {
    const conn = await handshake('/subscription/raw');

    conn.send({ type: 'nope' });

    const error = await conn.nextFrame();
    assert.equal(error.type, 'error');
    assert.equal(error.code, 'ProtocolError');
    assert.match(error.message, /Unknown frame type: nope/);

    await conn.close();
  });

  test('unsubscribe releases the engine subscription and ignores unknown ids', async () => {
    const conn = await handshake('/subscription/raw');
    const subscriptionId = await subscribe(conn, { bindings });

    conn.send({ type: 'unsubscribe', subscriptionId: 'not-mine' });
    conn.send({ type: 'unsubscribe', subscriptionId });
    // frames are handled in order, so both unsubscribes are processed before
    // the server answers the close
    await conn.close();

    assert.deepEqual(pulseEngine.unsubscribed, [subscriptionId]);
  });

  test('closing the socket releases open subscriptions and logs the close', async () => {
    const conn = await handshake('/subscription/raw');
    const subscriptionId = await subscribe(conn, { bindings });

    conn.ws.close(4000, 'done');
    await conn.closed;
    await serverSideClosed();

    assert.deepEqual(pulseEngine.unsubscribed, [subscriptionId]);
    assert.equal(pulseEngine.subscriptions.size, 0);

    const closedLogs = messagesOfType('websocket-closed');
    assert.equal(closedLogs.length, 1);
    assert.equal(closedLogs[0].Fields.closeCode, 4000);
    assert.equal(closedLogs[0].Fields.openSubscriptions, 1);
  });

  test('subscription errors are relayed as error frames and reported', async () => {
    const conn = await handshake('/subscription/raw');
    const subscriptionId = await subscribe(conn, { bindings });
    const error = Object.assign(new Error('Error binding queue: no such exchange'), { code: 'BindFailed' });

    pulseEngine.subscriptions.get(subscriptionId).handleError(error);

    assert.deepEqual(await conn.nextFrame(), {
      type: 'error',
      subscriptionId,
      code: 'SubscriptionError',
      message: error.message,
    });
    await helper.expectMonitorError('BindFailed');

    await conn.close();
  });
});
