# Taskcluster Metrics Library

A lightweight library for exposing metrics to Prometheus for Taskcluster services.

## Usage

```javascript
import { MetricsManager } from 'taskcluster-lib-metrics';
import http from 'http';

async function initializeApp() {
  // Register metrics in your service
  MetricsManager.register({
    name: 'requestDurationSeconds', // Renamed for clarity on unit
    type: 'histogram',
    serviceName: 'api-service',
    description: 'Request duration in seconds',
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 5], // Buckets appropriate for seconds
    labelNames: ['method', 'path', 'status'],
  });

  // Set up metrics with an internal server for Kubernetes scraping
  // MetricsManager.setup() is now async
  const metrics = await MetricsManager.setup({
    serviceName: 'api-service',
    prefix: 'apisvc', // Example prefix
    server: {
      port: 9100,
      ip: '0.0.0.0',  // Listen on all interfaces
    },
  });

  // Use metrics in your code
  // Correct parameter order: name, value, labels
  metrics.observe('requestDurationSeconds', 0.123, { method: 'GET', path: '/v1/ping', status: 200 }); // 0.123 seconds

  // For a custom HTTP server, you can add metrics tracking
  // (This is often done by built-in metrics like http_requests_total and http_request_duration_seconds if wrapHttpServer is used)
  // For this example, assume wrapHttpServer handles general request metrics.

  const server = http.createServer((req, res) => {
    // Your request handler
    // Example: const end = metrics.startTimer('requestDurationSeconds', {method: req.method, path: req.url});
    // res.on('finish', () => end({status: res.statusCode}));
    res.end('Hello!');
  });

  // Wrap the HTTP server to add metrics tracking (e.g., http_requests_total)
  // This uses the built-in metrics if they are registered (they are by default)
  wrapHttpServer(server, metrics);

  server.listen(3000, () => {
    console.log('Main application server listening on port 3000');
  });
}

initializeApp().catch(console.error);
```

## Features

### Standalone Metrics Server

The library can run a dedicated HTTP server on a separate port specifically for exposing metrics to Prometheus, ideal for Kubernetes environments:

```javascript
// (inside an async function)
const metrics = await MetricsManager.setup({
  serviceName: 'my-service',
  server: {
    port: 9100,         // Default port for Prometheus
    ip: '0.0.0.0',       // Listen on all interfaces
  },
});
```

This creates a server (managed by the `metrics` instance via `metrics.startHttpServer()`) with two endpoints:
- `/metrics` - Returns Prometheus-formatted metrics (asynchronously)
- `/health` - A simple health check endpoint

### Push Gateway Support for Cronjobs and Short-lived Processes

For processes that might terminate before being scraped (like cronjobs), you can push metrics to a Prometheus PushGateway:

```javascript
// (inside an async function)
const metrics = await MetricsManager.setup({
  serviceName: 'cron-job-worker',
  push: {
    gateway: 'http://pushgateway:9091',  // URL of your Prometheus PushGateway
    jobName: 'periodic-cleanup',          // Optional, defaults to serviceName
    groupings: {                          // Optional additional labels
      instance: 'worker-1',
      environment: 'production',
    },
    // interval: null (or not specified) means startPushing will attempt one push.
  },
});

// Run your job...
// Metrics are updated throughout the job.

// Push metrics at the end of the job using the configured push function.
// metrics.startPushing (called by setup) will have made an initial push if no interval.
// The metrics.push() function is available for subsequent manual pushes.
if (metrics.push) {
  await metrics.push();
  console.log('Final metrics pushed for cron job.');
}
```

For long-running processes that want to periodically push metrics:

```javascript
// (inside an async function)
const metrics = await MetricsManager.setup({
  serviceName: 'background-process',
  push: {
    gateway: 'http://pushgateway:9091',
    interval: 60000,  // Push every 60 seconds
    // jobName and groupings are also available here
  },
});
// The metrics.startPushing() method (called by setup) will have configured the interval.
```

### Graceful Shutdown

When your application terminates, you should clean up the metrics server and push intervals:

```javascript
process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  if (metrics) { // Ensure metrics instance was initialized
    await metrics.terminate();  // Stops server and push interval, and attempts a final push if configured.
  }
  process.exit(0);
});
```

## API

### MetricsManager

#### `MetricsManager.register(options)`

Registers a new metric type with the following options:

- `name` (string): Name of the metric (e.g., `my_metric_total`, `request_duration_seconds`).
- `type` ('counter' | 'gauge' | 'histogram' | 'summary'): Type of metric.
- `description` (string): Description of the metric.
- `labelNames` (string[], optional): Array of label names.
- `serviceName` (string, optional): Service name. If not specified, metric is global.
- `buckets` (number[], optional): Array of bucket upper bounds for histograms.
- `percentiles` (number[], optional): Array of percentiles (0-1) for summaries.

#### `async MetricsManager.setup(options)`

Sets up metrics for a service. Returns: `Promise<Metrics>`.

Options:
- `serviceName` (string): Name of the service.
- `prefix` (string, optional): Prefix for all metrics (defaults to a sanitized service name).
- `server` (ServerOptions, optional): Options for internal metrics server.
  - `port` (number, default: 9100): Port to listen on.
  - `ip` (string, default: '127.0.0.1'): IP to bind to.
- `push` (PushOptions, optional): Options for pushing to a Prometheus PushGateway.
  - `gateway` (string, required): URL of the PushGateway.
  - `jobName` (string, optional, default: serviceName): Job name for PushGateway.
  - `groupings` (Record<string, string>, optional, default: {}): Additional groupings for the push.
  - `interval` (number | null, optional): Auto-push interval in ms. If `null` or `0`, an initial push is attempted by `metrics.startPushing` if gateway is configured, but no interval is set.

Returns a `Metrics` instance, which has metrics collection methods and manages the server/push lifecycle via `startHttpServer`, `startPushing`, and `terminate`.

### Metrics (instance returned by `MetricsManager.setup`)

#### `metrics.increment(name, [value=1], [labels={}])`
Increments a counter by the specified `value` (default: 1).
- `name` (string): Name of the metric.
- `value` (number, optional): Value to increment by.
- `labels` (Record<string, string | number | boolean>, optional): Labels object.

#### `metrics.decrement(name, [value=1], [labels={}])`
Decrements a gauge by the specified `value` (default: 1).
- `name` (string): Name of the metric.
- `value` (number, optional): Value to decrement by.
- `labels` (Record<string, string | number | boolean>, optional): Labels object.

#### `metrics.set(name, value, [labels={}])`
Sets a gauge to the specified `value`.
- `name` (string): Name of the metric.
- `value` (number): Value to set.
- `labels` (Record<string, string | number | boolean>, optional): Labels object.

#### `metrics.observe(name, value, [labels={}])`
Observes a `value` for a histogram or summary.
- `name` (string): Name of the metric.
- `value` (number): Value to observe.
- `labels` (Record<string, string | number | boolean>, optional): Labels object.

#### `metrics.startTimer(name, [labels={}])`
Starts a timer for a histogram or summary. Returns a function that, when called (e.g., `endTimer({finalLabel: 'value'})`), records the duration and returns the duration in seconds.
- `name` (string): Name of the metric.
- `labels` (Record<string, string | number | boolean>, optional): Initial labels object.
- **Returned function `endTimer([finalLabels])`**:
  - `finalLabels` (Record<string, string | number | boolean>, optional): Additional/override labels to apply when recording.

#### `async metrics.push()`
Manually pushes metrics to the configured PushGateway. Returns a `Promise`. This function is configured by `metrics.startPushing()` (called during `MetricsManager.setup()` if `push` options are provided).

#### `async metrics.terminate()`
Stops the metrics server and any push interval. Attempts a final metrics push if push was configured. Returns a `Promise` that resolves when shutdown is complete.

#### `metrics.createMetricsHandler()`
Returns an `async` request handler function `async (req, res) => void` for serving metrics in Prometheus format. Suitable for use with Express or Node's `http` server.

#### `metrics.startHttpServer(options)`
Starts the internal HTTP server for metrics. Called by `MetricsManager.setup` if `server` options are provided. Can be called manually if `setup` was invoked without server options.
- `options` (ServerOptions): Same as `server` options in `MetricsManager.setup`.

#### `async metrics.startPushing(options)`
Configures and starts pushing metrics to a PushGateway. Called by `MetricsManager.setup` if `push` options are provided. Can be called manually.
- `options` (PushOptions): Same as `push` options in `MetricsManager.setup`.

### HTTP Utilities (Imported separately if needed)

#### `createMetricsHandler(metrics)`
`import { createMetricsHandler } from 'taskcluster-lib-metrics/middleware'; // or appropriate path`
Creates an `async` request handler function `async (req, res) => void` for serving metrics. This is similar to `metrics.createMetricsHandler()` but can be used if you only have a `Metrics` instance and want to construct the handler externally.

```javascript
// (inside an async function, or an async request handler itself)
// const { createMetricsHandler } = require('taskcluster-lib-metrics'); // Or import
// const metricsRequestHandler = createMetricsHandler(metrics);
// http.createServer(async (req, res) => {
//   if (req.url === '/metrics' && req.method === 'GET') {
//     await metricsRequestHandler(req, res); // Note: await if the handler is async
//   } else {
//     // Handle other requests
//   }
// }).listen(8080);
```

#### `wrapHttpServer(server, metrics)`
`import { wrapHttpServer } from 'taskcluster-lib-metrics/middleware'; // or appropriate path`
Wraps an existing Node.js `http.Server` instance to add automatic metrics tracking for HTTP requests (e.g., `http_requests_total`, `http_request_duration_seconds`). These metrics must be registered (they are by default as built-ins).

```javascript
import http from 'http';
// const { wrapHttpServer } = require('taskcluster-lib-metrics'); // Or import
// const metrics = await MetricsManager.setup(...);

const mainAppServer = http.createServer((req, res) => {
  // Your request handler
  res.end('OK');
});

// Add metrics tracking
wrapHttpServer(mainAppServer, metrics);

mainAppServer.listen(3000);
```

#### `createMetricsServer(metrics, options)`
`import { createMetricsServer } from 'taskcluster-lib-metrics/middleware'; // or appropriate path`
Creates a standalone HTTP server for exposing metrics. This is an alternative to using `metrics.startHttpServer()` if you want to manage the server's lifecycle externally.

```javascript
// const { createMetricsServer } = require('taskcluster-lib-metrics'); // Or import
// const metrics = await MetricsManager.setup(...); // Can be setup without server options initially

const metricsHttpServer = createMetricsServer(metrics, {
  port: 9100,
  ip: '0.0.0.0',
});

// Later, when shutting down
// metricsHttpServer.close();
```
