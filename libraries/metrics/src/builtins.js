/**
 * This file defines common built-in metrics that are registered with the MetricsManager.
 * These metrics are available for all services to use.
 */

import { MetricsManager } from './metricsmanager.js';

// HTTP request metrics
MetricsManager.register({
  name: 'http_request_duration_seconds',
  type: 'histogram',
  description: 'HTTP request duration in seconds',
  labelNames: ['method', 'path', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
});

MetricsManager.register({
  name: 'http_requests_total',
  type: 'counter',
  description: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status'],
});

// API metrics
MetricsManager.register({
  name: 'api_method_calls_total',
  type: 'counter',
  description: 'Total number of API method calls',
  labelNames: ['method', 'status'],
});

MetricsManager.register({
  name: 'api_method_duration_seconds',
  type: 'histogram',
  description: 'API method duration in seconds',
  labelNames: ['method', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
});

// Queue metrics
// MetricsManager.register({
//   name: 'queue_size',
//   type: 'gauge',
//   description: 'Current queue size',
//   labelNames: ['queue'],
// });

// MetricsManager.register({
//   name: 'queue_tasks_total',
//   type: 'counter',
//   description: 'Total number of tasks processed by the queue',
//   labelNames: ['queue', 'status'],
// });

// Process metrics
MetricsManager.register({
  name: 'process_memory_rss_bytes',
  type: 'gauge',
  description: 'Process resident memory size in bytes',
});

MetricsManager.register({
  name: 'process_cpu_user_seconds_total',
  type: 'counter',
  description: 'Total user CPU time spent in seconds',
});

MetricsManager.register({
  name: 'process_cpu_system_seconds_total',
  type: 'counter',
  description: 'Total system CPU time spent in seconds',
});

// DB metrics
MetricsManager.register({
  name: 'db_operation_duration_seconds',
  type: 'histogram',
  description: 'Database operation duration in seconds',
  labelNames: ['operation', 'table', 'status'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
});

MetricsManager.register({
  name: 'db_connections',
  type: 'gauge',
  description: 'Current number of database connections',
  labelNames: ['state'],
});
