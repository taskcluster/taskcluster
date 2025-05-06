import express from 'express';
import { MetricsManager } from '../src/index.js';

// IIFE to allow top-level await for setup
(async () => {
  // Register service-specific metrics
  MetricsManager.register({
    name: 'api_specific_counter',
    type: 'counter',
    description: 'A service-specific counter',
    labelNames: ['endpoint'],
    serviceName: 'example-service',
  });

  MetricsManager.register({
    name: 'api_operation_duration',
    type: 'histogram',
    description: 'Duration of API operations in milliseconds',
    labelNames: ['operation'],
    buckets: [10, 50, 100, 500, 1000],
    serviceName: 'example-service',
  });

  // Setup metrics for this service
  // MetricsManager.setup() is now async
  const metrics = await MetricsManager.setup({
    serviceName: 'example-service',
  });

  // Create an Express app
  const app = express();

  // Example middleware to track HTTP requests
  // This custom middleware uses the built-in metrics http_requests_total and http_request_duration_seconds
  // Ensure these are registered (they are by default in builtins.js as global metrics)
  app.use((req, res, next) => {
    const start = Date.now();

    res.on('finish', () => {
      const duration = (Date.now() - start) / 1000; // Convert to seconds
      const { method } = req;
      let path = req.route ? req.route.path : req.path;
      const status = res.statusCode;

      // Normalize path for better cardinality
      // Example: /api/users/123 -> /api/users/:param
      if (req.route && req.route.path && req.route.path.includes(':')) {
        path = req.route.path;
      }
      // For unhandled routes or non-express-route paths, req.path is used as is.

      metrics.increment('http_requests_total', 1, { method, path, status });
      metrics.observe('http_request_duration_seconds', duration, { method, path, status });

      // Update service-specific metrics if the path matches an endpoint
      if (req.route) { // only for actual matched routes
        metrics.increment('api_specific_counter', 1, { endpoint: req.route.path });
      }
    });

    next();
  });

  // Example API endpoint
  app.get('/api/users', (req, res) => {
    const endTimer = metrics.startTimer('api_operation_duration', { operation: 'get_users' });

    setTimeout(() => {
      endTimer();
      res.json({ users: ['user1', 'user2', 'user3'] });
    }, 100);
  });

  app.get('/api/posts/:id', (req, res) => {
    const endTimer = metrics.startTimer('api_operation_duration', { operation: 'get_post_by_id' });
    setTimeout(() => {
      endTimer();
      res.json({ postId: req.params.id, content: 'Example post' });
    }, 50);
  });

  // Mount metrics handler at /metrics endpoint
  // The Metrics class provides createMetricsHandler() which returns a (req, res) => void handler
  app.get('/metrics', metrics.createMetricsHandler());

  // Start the server
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    console.log(`Metrics available at http://localhost:${PORT}/metrics`);
  });

})().catch(error => {
  console.error('Failed to start basic-usage example:', error);
  process.exit(1);
});
