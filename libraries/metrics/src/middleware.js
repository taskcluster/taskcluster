import assert from 'assert';
import http from 'http';

/**
 * @typedef {object} CreateMetricsServerOptions
 * @property {number} [port=9100] - Port to listen on.
 * @property {string} [ip='127.0.0.1'] - IP address to bind to.
 */

/**
 * Create HTTP request handler for metrics endpoint.
 * This handler is intended to be used with an existing HTTP server (e.g., Express app.get('/metrics', handler)).
 * @param {import('./metrics.js').Metrics} metrics - The metrics instance.
 * @param {import('taskcluster-lib-monitor').Monitor | null} [monitor]
 * @returns {(req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>}
 */
export const createMetricsHandler = (metrics, monitor) => {
  assert(metrics.registry, 'metrics.registry is required');

  return async (req, res) => {
    try {
      if (req.method !== 'GET') {
        res.statusCode = 405;
        res.setHeader('Content-Type', 'text/plain');
        res.end('Method Not Allowed');
        return;
      }

      res.setHeader('Content-Type', metrics.registry.contentType());
      const metricsData = await metrics.registry.metrics();
      res.end(metricsData);
    } catch (error) {
      monitor?.reportError(`Error in createMetricsHandler: ${error.message}`);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'text/plain');
      }
      res.end('Internal Server Error generating metrics');
    }
  };
};

/**
 * Creates a wrapper for an HTTP server that adds metrics for each request.
 * This function modifies the server instance by replacing its request listeners.
 * @param {http.Server} server - The HTTP server to wrap.
 * @param {import('./metrics.js').Metrics} metrics - The metrics instance.
 * @returns {http.Server}
 */
export const wrapHttpServer = (server, metrics) => {
  assert(server, 'server must be provided');
  assert(metrics.registry, 'metrics registry must be provided');

  const originalListeners = server.listeners('request').slice();
  server.removeAllListeners('request');

  const metricsListener = (req, res) => {
    const start = Date.now();

    res.on('finish', () => {
      const duration = (Date.now() - start) / 1000;
      const method = req.method;
      const host = req.headers.host || 'localhost';
      const url = new URL(req.url || '/', `http://${host}`);
      const path = url.pathname;
      const status = res.statusCode;

      metrics.increment('http_requests_total', 1, { method, path, status });
      metrics.observe('http_request_duration_seconds', duration, { method, path, status });
    });

    if (originalListeners.length > 0) {
      for (const listener of originalListeners) {
        listener.call(server, req, res);
      }
    }
  };

  server.on('request', metricsListener);
  return server;
};

/**
 * Creates a standalone metrics HTTP server.
 * This server will expose /metrics and /health endpoints.
 * @param {import('./metrics.js').Metrics} metrics - The metrics instance.
 * @param {CreateMetricsServerOptions} [options={}] - Options for the server.
 * @param {import('taskcluster-lib-monitor').Monitor | null} [monitor]
 * @returns {http.Server} The created HTTP server.
 */
export const createMetricsServer = (metrics, options = {}, monitor = null) => {
  const { port = 9100, ip = '127.0.0.1' } = options;

  // The request handler is now async due to registry.metrics() being async
  const server = http.createServer(async (req, res) => {
    try {
      const host = req.headers.host || `${ip}:${port}`;
      const url = new URL(req.url || '/', `http://${host}`);
      const path = url.pathname;

      if (req.method === 'GET') {
        if (path === '/metrics') {
          res.setHeader('Content-Type', metrics.registry.contentType());
          const metricsData = await metrics.registry.metrics();
          res.end(metricsData);
        } else if (path === '/health') {
          res.setHeader('Content-Type', 'text/plain');
          res.end('OK');
        } else {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'text/plain');
          res.end('Not Found');
        }
      } else {
        res.statusCode = 405;
        res.setHeader('Content-Type', 'text/plain');
        res.end('Method Not Allowed');
      }
    } catch (error) {
      monitor?.reportError(`Error in createMetricsServer request handler for ${metrics.serviceName}: ${error.message}`);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'text/plain');
      }
      res.end('Internal Server Error in metrics endpoint');
    }
  });

  server.listen(port, ip, () => {
    monitor?.info(`Standalone metrics server for ${metrics.serviceName} listening on ${ip}:${port}/metrics`);
  });

  server.on('error', (err) => {
    monitor?.reportError(`Standalone metrics server error for ${metrics.serviceName} on ${ip}:${port}: ${err.message}`);
  });

  return server;
};
