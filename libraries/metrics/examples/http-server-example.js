import http from 'http';
import { MetricsManager, wrapHttpServer } from '../src/index.js';

// IIFE to allow top-level await
(async () => {
  // Register service-specific metrics
  MetricsManager.register({
    name: 'api_specific_counter',
    type: 'counter',
    description: 'A service-specific counter',
    labelNames: ['endpoint'],
    serviceName: 'web-service',
  });

  // *** Add missing registration for api_operation_duration ***
  MetricsManager.register({
    name: 'api_operation_duration_seconds', // Clarified unit
    type: 'histogram',
    description: 'Duration of API operations in seconds',
    labelNames: ['operation', 'status'], // Added status label for more detail
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2.5, 5], // Standard buckets for seconds
    serviceName: 'web-service',
  });

  // Setup metrics for this service with a dedicated metrics server
  // MetricsManager.setup() is now async.
  // The `server` option will lead to `metrics.startHttpServer()` being called internally.
  const metrics = await MetricsManager.setup({
    serviceName: 'web-service',
    prefix: 'webservice', // Example of using a custom prefix
    server: {
      port: 9100,
      ip: '0.0.0.0', // Bind to all interfaces for Prometheus scraping
    },
  });

  // Create an HTTP server for the main API
  const mainApiServer = http.createServer((req, res) => {
    const defaultBase = `http://${req.headers.host || `localhost:${PORT}`}`;
    const url = new URL(req.url || '/', defaultBase);
    const path = url.pathname;

    let operationStatus = 'success'; // To be used in labels

    if (req.method === 'GET') {
      if (path === '/api/users') {
        const endTimer = metrics.startTimer('api_operation_duration_seconds', { operation: 'get_users' });

        setTimeout(() => {
          try {
            // Simulate work
            if (Math.random() < 0.1) { // 10% chance of simulated error
              operationStatus = 'error';
              throw new Error('Simulated internal error getting users');
            }
            metrics.increment('api_specific_counter', 1, { endpoint: '/api/users' });
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ users: ['user1', 'user2', 'user3'] }));
          } catch (e) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: e.message }));
          } finally {
            endTimer({ status: operationStatus }); // Record duration with status
          }
        }, 100);
      } else if (path === '/') {
        res.setHeader('Content-Type', 'text/plain');
        res.end('Hello World from main API!');
      } else {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'text/plain');
        res.end('Not Found on main API');
      }
    } else {
      res.statusCode = 405;
      res.setHeader('Content-Type', 'text/plain');
      res.end('Method Not Allowed on main API');
    }
  });

  // Wrap the main API server to add automatic HTTP request metrics
  // (http_requests_total, http_request_duration_seconds)
  wrapHttpServer(mainApiServer, metrics);

  // Start the main server for public API endpoints
  const PORT = process.env.PORT || 3000;
  mainApiServer.listen(PORT, () => {
    console.log(`Main API server listening on http://localhost:${PORT}`);
    // The metrics server started by MetricsManager.setup will log its own readiness
    // console.log(`Metrics available on separate server at http://localhost:9100/metrics`);
  });

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nGracefully shutting down from SIGINT (Ctrl-C)...');
    await metrics.terminate(); // Shuts down the metrics server
    mainApiServer.close(() => {
      console.log('Main API server closed.');
      process.exit(0);
    });
  });

  process.on('SIGTERM', async () => {
    console.log('Gracefully shutting down from SIGTERM...');
    await metrics.terminate(); // Shuts down the metrics server
    mainApiServer.close(() => {
      console.log('Main API server closed.');
      process.exit(0);
    });
  });

})().catch(error => {
  console.error('Failed to start http-server example:', error);
  process.exit(1);
});
