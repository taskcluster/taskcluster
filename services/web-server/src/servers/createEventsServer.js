import WebSocket from 'ws';
import EventsConnection from './EventsConnection.js';

const { Server: WebSocketServer } = WebSocket;

const CONNECTION_INIT_TIMEOUT_MS = 10000;

export default ({ cfg, server, pulseEngine, clients, authFactory, monitor }) => {
  const wss = new WebSocketServer({ server, path: '/events' });

  // Each connection owns its own lifecycle (keepalive, timeouts, subscription
  // teardown); the instance stays reachable through the socket's listeners.
  wss.on('connection', ws => {
    new EventsConnection({
      ws,
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

  return wss;
};
