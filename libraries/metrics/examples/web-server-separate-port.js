import express from 'express';
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

  MetricsManager.register({
    name: 'api_operation_duration_seconds', // Clarified unit
    type: 'histogram',
    description: 'Duration of API operations in seconds',
    labelNames: ['operation', 'status'], // Added status label
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2.5, 5], // Standard buckets for seconds
    serviceName: 'web-service',
  });

  let metrics;
  try {
    // Setup metrics for this service with a dedicated metrics server
    // MetricsManager.setup() is now async.
    // The `server` option will lead to `metrics.startHttpServer()` being called internally.
    metrics = await MetricsManager.setup({
      serviceName: 'web-service',
      prefix: 'webapp', // Example prefix
      server: {
        port: 9102, // Different port to avoid conflict with other examples
        ip: '0.0.0.0', // Bind to all interfaces for Prometheus scraping
      },
    });
  } catch (error) {
    console.error('Failed to initialize metrics:', error);
    process.exit(1);
  }

  // Create the main Express app
  const app = express();

  // Wrap the Express app's underlying HTTP server to add automatic HTTP request metrics
  // Note: This needs to be done BEFORE app.listen() is called if you want to wrap
  // the server instance that Express creates. Alternatively, create an http.Server manually,
  // pass it to Express, wrap it, then call server.listen().
  // For simplicity here, we'll let Express create the server,
  // then wrap it after listen (less ideal but works for demo).
  // A better pattern is: const httpServer = http.createServer(app); wrapHttpServer(httpServer, metrics);
  // httpServer.listen(...);

  // Example API endpoint
  app.get('/api/data', (req, res) => {
    let operationStatus = 'success';
    const endTimer = metrics.startTimer('api_operation_duration_seconds', { operation: 'get_api_data' });

    setTimeout(() => {
      try {
        if (Math.random() < 0.15) { // 15% chance of error
          operationStatus = 'error';
          throw new Error('Simulated error fetching API data');
        }
        metrics.increment('api_specific_counter', 1, { endpoint: '/api/data' });
        res.json({ data: 'some important data', timestamp: Date.now() });
      } catch (e) {
        res.status(500).json({ error: e.message });
      } finally {
        endTimer({ status: operationStatus });
      }
    }, Math.random() * 150 + 50);
  });

  app.get('/', (req, res) => {
    res.send('Hello from Express web server! Metrics are on a separate port.');
  });

  // Start the main server for public API endpoints
  const PORT = process.env.PORT || 3001; // Use a different port for the main app
  const mainExpressServer = app.listen(PORT, () => {
    console.log(`Main Express API server listening on http://localhost:${PORT}`);
    // The metrics server started by MetricsManager.setup will log its own readiness.
    // To correctly wrap the server Express uses, it's better to create an http.Server explicitly.
    // However, for this example, we demonstrate the concept. `wrapHttpServer` typically expects
    // the raw http.Server object.
    // If wrapHttpServer is to be used, it should ideally wrap the server *before* listen.
    // Let's adjust to show a more correct way of using wrapHttpServer with Express:
  });

  // Correctly wrap the server instance that app.listen() returns.
  // Note: This is specific to how Express app.listen() returns the http.Server.
  // Some frameworks might require different handling.
  wrapHttpServer(mainExpressServer, metrics);
  console.log('Express server has been wrapped for HTTP metrics.');

  // Handle graceful shutdown
  async function shutdown(signal) {
    console.log(`\nReceived ${signal}. Shutting down gracefully...`);
    if (metrics) {
      await metrics.terminate(); // Shuts down the metrics server
    }
    mainExpressServer.close(() => {
      console.log('Main Express server closed.');
      process.exit(0);
    });
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

})().catch(topLevelError => {
  console.error('Failed to start web-server-separate-port example:', topLevelError);
  process.exit(1);
});
