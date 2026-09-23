import assert from 'node:assert';
import testing from '@taskcluster/lib-testing';
import SubscriptionConnection from '../src/servers/SubscriptionConnection.js';

const makeWs = () => {
  const ws = {
    readyState: 1,
    OPEN: 1,
    frames: [],
    closes: [],
    on() {},
    ping() {},
    terminate() {},
    send(data, cb) {
      ws.frames.push(JSON.parse(data));

      if (cb) {
        cb(null);
      }
    },
    close(code, reason) {
      ws.closes.push({ code, reason });
    },
  };

  return ws;
};

const makeMonitor = reportedErrors => ({
  reportError(err) {
    reportedErrors.push(err);
  },
  log: { websocketClosed() {}, websocketConnected() {} },
});

// Builds a connection whose auth client throws `err`, and runs the
// connection_init handshake, returning the fake ws for assertions.
const handshakeWith = async (err, initFrame = { type: 'connection_init' }) => {
  const ws = makeWs();
  const reportedErrors = [];
  const connection = new SubscriptionConnection({
    ws,
    resolveBindings: () => ({}),
    pulseEngine: {},
    authFactory: () => ({
      currentScopes: async () => {
        throw err;
      },
    }),
    monitor: makeMonitor(reportedErrors),
    socketAliveTimeoutMilliSeconds: 10000,
    connectionInitTimeoutMilliSeconds: 10000,
  });

  await connection.onMessage(JSON.stringify(initFrame));
  connection.teardown(1000);

  return { ws, reportedErrors };
};

suite(testing.suiteName(), () => {
  test('expired credentials produce AuthenticationFailed and close 4401', async () => {
    const err = new Error('ext.certificate.expiry < now');
    err.statusCode = 401;

    const { ws, reportedErrors } = await handshakeWith(err);

    assert.deepEqual(ws.frames, [
      {
        type: 'error',
        code: 'AuthenticationFailed',
        message: 'Authentication failed: credentials are invalid or expired',
        details: {},
      },
    ]);
    assert.deepEqual(ws.closes, [{ code: 4401, reason: 'AuthenticationFailed' }]);
    assert.deepEqual(reportedErrors, []);
  });

  test('malformed authorization token produces AuthenticationFailed and close 4401', async () => {
    const { ws, reportedErrors } = await handshakeWith(new Error('unreachable'), {
      type: 'connection_init',
      authorization: 'Bearer Hello :)',
    });

    assert.equal(ws.frames[0].code, 'AuthenticationFailed');
    assert.deepEqual(ws.closes, [{ code: 4401, reason: 'AuthenticationFailed' }]);
    assert.deepEqual(reportedErrors, []);
  });

  test('other errors produce InternalError and close 1011', async () => {
    const err = new Error('boom');
    const { ws, reportedErrors } = await handshakeWith(err);

    assert.equal(ws.frames[0].code, 'InternalError');
    assert.deepEqual(ws.closes, [{ code: 1011, reason: 'Internal error' }]);
    assert.deepEqual(reportedErrors, [err]);
  });
});
