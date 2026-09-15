import WebSocket from 'ws';
import SubscriptionConnection from './SubscriptionConnection.js';
import { resolveNamedBindings, resolveRawBindings } from './resolveBindings.js';

const { Server: WebSocketServer } = WebSocket;

const CONNECTION_INIT_TIMEOUT_MS = 10000;

// Parse `allowedCORSOrigins` the same way createApp.js does for HTTP CORS:
// entries wrapped in `/.../` are regular expressions, everything else is an
// exact origin string. Empty entries are dropped.
const parseAllowedOrigins = allowedCORSOrigins =>
  allowedCORSOrigins
    .map(o => {
      if (typeof o === 'string' && o.startsWith('/')) {
        return new RegExp(o.slice(1, o.length - 1));
      }

      return o;
    })
    .filter(o => o && o !== '');

// Match an origin against the parsed allowlist with the same semantics as the
// `cors` package: a RegExp entry is tested, a boolean entry (e.g. `true`, used
// in local development to mean "any origin") is taken as-is, and anything else
// is an exact string comparison.
const originMatches = (allowed, origin) =>
  allowed.some(entry => {
    if (entry instanceof RegExp) {
      return entry.test(origin);
    }

    if (typeof entry === 'boolean') {
      return entry;
    }

    return entry === origin;
  });

export default ({ cfg, server, pulseEngine, clients, authFactory, monitor }) => {
  const allowedOrigins = parseAllowedOrigins(cfg.server.allowedCORSOrigins);

  // Browsers always send an Origin header on a WebSocket handshake, so an
  // Origin that isn't allowlisted is a cross-site connection attempt. A request
  // with no Origin is a non-browser client (not subject to the same-origin
  // policy) and is allowed, matching the HTTP CORS posture.
  const isOriginAllowed = origin => origin === undefined || originMatches(allowedOrigins, origin);

  // One endpoint per subscription kind, differing only in how subscribe frames
  // resolve to bindings: /subscription/raw takes pre-resolved exchange/pattern
  // bindings (the Pulse debugger), /subscription/named takes event names the
  // server resolves via the service events clients. Both speak the same frame
  // protocol; separate endpoints let auth requirements differ per kind.
  const endpoints = new Map([
    ['/subscription/raw', resolveRawBindings],
    ['/subscription/named', frame => resolveNamedBindings(frame, clients)],
  ]);

  const connectionOptions = {
    pulseEngine,
    authFactory,
    monitor,
    socketAliveTimeoutMilliSeconds: cfg.server.socketAliveTimeoutMilliSeconds,
    connectionInitTimeoutMilliSeconds: CONNECTION_INIT_TIMEOUT_MS,
  };

  const wss = new WebSocketServer({
    noServer: true,
    // ws runs verifyClient inside handleUpgrade (even in noServer mode), before
    // the handshake completes. The two-argument form lets us reject with a 403
    // and log it, rather than the default 401. `info.origin` is the handshake
    // Origin header, normalized across protocol versions by ws.
    verifyClient: ({ origin }, done) => {
      if (isOriginAllowed(origin)) {
        done(true);
        return;
      }

      monitor.log.websocketOriginRejected({ origin: origin ?? null });
      done(false, 403, 'Forbidden');
    },
  });

  // ws's `path` option supports a single path, so upgrades are routed by hand.
  server.on('upgrade', (req, socket, head) => {
    if (!URL.canParse(req.url, 'http://localhost')) {
      socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }

    const { pathname } = new URL(req.url, 'http://localhost');
    const resolveBindings = endpoints.get(pathname);

    if (!resolveBindings) {
      socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }

    // Origin validation happens in verifyClient, inside handleUpgrade.
    wss.handleUpgrade(req, socket, head, ws => {
      // Each connection owns its own lifecycle (keepalive, timeouts,
      // subscription teardown); the instance stays reachable through the
      // socket's listeners.
      new SubscriptionConnection({ ws, resolveBindings, ...connectionOptions });
    });
  });

  return wss;
};
