import WebSocket from 'ws';
import EventsConnection from './EventsConnection.js';

const { Server: WebSocketServer } = WebSocket;

const CONNECTION_INIT_TIMEOUT_MS = 10000;

// One endpoint per subscription kind: /events/raw takes pre-resolved
// exchange/pattern bindings (the Pulse debugger), /events/named takes event
// names the server resolves via the service events clients. Both speak the
// same frame protocol; the endpoint fixes how subscribe frames are
// interpreted, and lets auth requirements differ per endpoint.
const ENDPOINTS = {
  '/events/raw': 'raw',
  '/events/named': 'named',
};

export default ({ cfg, server, pulseEngine, clients, authFactory, monitor }) => {
  const servers = new Map();

  for (const [path, kind] of Object.entries(ENDPOINTS)) {
    const wss = new WebSocketServer({ noServer: true });

    // Each connection owns its own lifecycle (keepalive, timeouts, subscription
    // teardown); the instance stays reachable through the socket's listeners.
    wss.on('connection', ws => {
      new EventsConnection({
        ws,
        kind,
        pulseEngine,
        clients,
        authFactory,
        monitor,
        socketAliveTimeoutMilliSeconds: cfg.server.socketAliveTimeoutMilliSeconds,
        connectionInitTimeoutMilliSeconds: CONNECTION_INIT_TIMEOUT_MS,
      });
    });

    wss.on('close', () => {
      for (const ws of wss.clients) {
        ws.close(1001, 'Server shutting down');
      }
    });

    servers.set(path, wss);
  }

  // Multiple WebSocket servers on one HTTP server require routing the upgrade
  // by hand — ws's `path`/`server` options support only a single server.
  server.on('upgrade', (req, socket, head) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    const wss = servers.get(pathname);

    if (!wss) {
      socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, ws => {
      wss.emit('connection', ws, req);
    });
  });

  return servers;
};
