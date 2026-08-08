import WebSocket from 'ws';
import EventsConnection from './EventsConnection.js';

const { Server: WebSocketServer } = WebSocket;

const PING_INTERVAL_MS = 30000;
const CONNECTION_INIT_TIMEOUT_MS = 10000;

export default ({ cfg, server, pulseEngine, clients, authFactory, monitor }) => {
  const wss = new WebSocketServer({ server, path: '/events' });

  wss.on('connection', ws => {
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

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

  const pingInterval = setInterval(() => {
    wss.clients.forEach(ws => {
      if (ws.isAlive === false) {
        ws.terminate();
        return;
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, PING_INTERVAL_MS);

  wss.on('close', () => clearInterval(pingInterval));

  return wss;
};
