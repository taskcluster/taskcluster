import WebSocket from 'ws';
import EventsConnection from './EventsConnection.js';
import { resolveNamedBindings, resolveRawBindings } from './resolveBindings.js';

const { Server: WebSocketServer } = WebSocket;

const CONNECTION_INIT_TIMEOUT_MS = 10000;

export default ({ cfg, server, pulseEngine, clients, authFactory, monitor }) => {
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

  const wss = new WebSocketServer({ noServer: true });

  // ws's `path` option supports a single path, so upgrades are routed by hand.
  server.on('upgrade', (req, socket, head) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    const resolveBindings = endpoints.get(pathname);

    if (!resolveBindings) {
      socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, ws => {
      // Each connection owns its own lifecycle (keepalive, timeouts,
      // subscription teardown); the instance stays reachable through the
      // socket's listeners.
      new EventsConnection({ ws, resolveBindings, ...connectionOptions });
    });
  });

  return wss;
};
