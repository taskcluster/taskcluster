import assert from 'assert';
import http from 'http';
import { EventEmitter } from 'events';
import testing from 'taskcluster-lib-testing';
import { MetricsManager, createMetricsHandler, wrapHttpServer, createMetricsServer } from '../src/index.js';

class MockResponse extends EventEmitter {
  constructor() {
    super();
    this.headers = {};
    this.statusCode = 200;
    this.body = '';
  }

  setHeader(name, value) {
    this.headers[name] = value;
  }

  end(data) {
    this.body = data;
    this.emit('finish');
    return this;
  }
}

// Mock request class for testing HTTP endpoints
class MockRequest extends EventEmitter {
  constructor(method = 'GET', url = '/metrics', headers = {}) {
    super();
    this.method = method;
    this.url = url;
    this.headers = { host: 'localhost:9100', ...headers };
  }
}

suite(testing.suiteName('middleware'), function() {
  // Clear metrics before each test and create a metrics instance
  let metrics;

  setup(async function() {
    MetricsManager.metrics = {};

    MetricsManager.register({
      name: 'http_requests_total',
      type: 'counter',
      description: 'Total HTTP requests',
      labelNames: ['method', 'path', 'status'],
    });

    MetricsManager.register({
      name: 'http_request_duration_seconds',
      type: 'histogram',
      description: 'HTTP request duration in seconds',
      labelNames: ['method', 'path', 'status'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
    });

    metrics = await MetricsManager.setup({ serviceName: 'test-middleware-service' });
  });

  suite('createMetricsHandler', function() {
    test('should return metrics on GET request', async function() {
      const handler = createMetricsHandler(metrics);
      const req = new MockRequest('GET', '/metrics');
      const res = new MockResponse();

      // Increment a counter metric to have some data
      metrics.increment('http_requests_total', 1, { method: 'GET', path: '/test', status: 200 });

      await handler(req, res);

      assert.strictEqual(res.statusCode, 200, 'Status code should be 200');
      assert.strictEqual(res.headers['Content-Type'], metrics.registry.contentType(), 'Content-Type should match registry contentType');
      assert.ok(res.body.includes('http_requests_total'), 'Response should include metric name');
      assert.ok(res.body.includes('method="GET"'), 'Response should include labels');
    });

    test('should return 405 on non-GET requests', async function() {
      const handler = createMetricsHandler(metrics);
      const req = new MockRequest('POST', '/metrics');
      const res = new MockResponse();

      await handler(req, res);

      assert.strictEqual(res.statusCode, 405, 'Status code should be 405 Method Not Allowed');
      assert.strictEqual(res.headers['Content-Type'], 'text/plain', 'Content-Type should be text/plain');
      assert.strictEqual(res.body, 'Method Not Allowed', 'Response body should indicate method not allowed');
    });

    test('should handle errors gracefully', async function() {
      const faultyMetrics = {
        registry: {
          metrics: () => { throw new Error('Simulated error'); },
          contentType: () => 'text/plain',
        },
      };

      const handler = createMetricsHandler(faultyMetrics);
      const req = new MockRequest('GET', '/metrics');
      const res = new MockResponse();

      await handler(req, res);

      assert.strictEqual(res.statusCode, 500, 'Status code should be 500 on error');
      assert.strictEqual(res.headers['Content-Type'], 'text/plain', 'Content-Type should be text/plain');
      assert.strictEqual(res.body, 'Internal Server Error generating metrics', 'Response body should indicate error');
    });
  });

  suite('wrapHttpServer', function() {
    let server, requests, responses;

    setup(function() {
      requests = [];
      responses = [];

      // Create a simple HTTP server with a test request listener
      server = new http.Server();
      server.on('request', (req, res) => {
        requests.push(req);
        responses.push(res);
        res.statusCode = 200;
        res.end('Original server response');
      });
    });

    test('should wrap HTTP server and preserve original listener', async function() {
      wrapHttpServer(server, metrics);

      const req = new MockRequest('GET', '/test');
      const res = new MockResponse();

      // Simulate a request by manually calling all request listeners
      server.listeners('request').forEach(listener => listener(req, res));

      assert.strictEqual(requests.length, 1, 'Original request listener should be called');
      assert.strictEqual(res.body, 'Original server response', 'Original response should be preserved');
    });

    test('should record metrics when the response finishes', async function() {
      wrapHttpServer(server, metrics);

      const req = new MockRequest('GET', '/api/test');
      const res = new MockResponse();

      // Simulate a request
      server.listeners('request').forEach(listener => listener(req, res));

      await new Promise(resolve => setTimeout(resolve, 10));

      const metricsText = await metrics.registry.metrics();

      assert.ok(metricsText.includes('http_requests_total'), 'Metrics should include http_requests_total');
      assert.ok(metricsText.includes('method="GET"'), 'Metrics should include method label');
      assert.ok(metricsText.includes('path="/api/test"'), 'Metrics should include path label');
      assert.ok(metricsText.includes('status="200"'), 'Metrics should include status label');
      assert.ok(metricsText.includes('http_request_duration_seconds'), 'Metrics should include duration histogram');
    });
  });

  suite('createMetricsServer', function() {
    let server;

    teardown(function() {
      if (server && server.listening) {
        server.close();
      }
    });

    test('should create a server with metrics and health endpoints', async function() {
      // Mock server.listen to prevent actual port binding
      const originalListen = http.Server.prototype.listen;
      http.Server.prototype.listen = function(port, ip, callback) {
        if (callback) {
          callback();
        }
        return this;
      };

      try {
        server = createMetricsServer(metrics, { port: 9100, ip: '127.0.0.1' });

        const metricsReq = new MockRequest('GET', '/metrics');
        const metricsRes = new MockResponse();

        await server.listeners('request')[0](metricsReq, metricsRes);

        assert.strictEqual(metricsRes.statusCode, 200, 'Metrics endpoint should return 200');
        assert.strictEqual(metricsRes.headers['Content-Type'], metrics.registry.contentType(), 'Content-Type should match registry contentType');
        assert.ok(metricsRes.body.includes('# TYPE'), 'Response should include metric type information');

        const healthReq = new MockRequest('GET', '/health');
        const healthRes = new MockResponse();

        await server.listeners('request')[0](healthReq, healthRes);

        assert.strictEqual(healthRes.statusCode, 200, 'Health endpoint should return 200');
        assert.strictEqual(healthRes.headers['Content-Type'], 'text/plain', 'Content-Type should be text/plain');
        assert.strictEqual(healthRes.body, 'OK', 'Health check should return OK');

        const notFoundReq = new MockRequest('GET', '/unknown');
        const notFoundRes = new MockResponse();

        await server.listeners('request')[0](notFoundReq, notFoundRes);

        assert.strictEqual(notFoundRes.statusCode, 404, 'Unknown path should return 404');
        assert.strictEqual(notFoundRes.body, 'Not Found', 'Should return Not Found message');

        const methodNotAllowedReq = new MockRequest('POST', '/metrics');
        const methodNotAllowedRes = new MockResponse();

        await server.listeners('request')[0](methodNotAllowedReq, methodNotAllowedRes);

        assert.strictEqual(methodNotAllowedRes.statusCode, 405, 'Non-GET request should return 405');
        assert.strictEqual(methodNotAllowedRes.body, 'Method Not Allowed', 'Should return Method Not Allowed message');
      } finally {
        // Restore original listen method
        http.Server.prototype.listen = originalListen;
      }
    });

    test('should handle errors gracefully', async function() {
      // Create metrics with a faulty registry
      const faultyMetrics = {
        serviceName: 'faulty-service',
        registry: {
          metrics: () => { throw new Error('Simulated error'); },
          contentType: () => 'text/plain',
        },
      };

      // Mock server.listen
      const originalListen = http.Server.prototype.listen;
      http.Server.prototype.listen = function(port, ip, callback) {
        if (callback) {
          callback();
        }
        return this;
      };

      try {
        server = createMetricsServer(faultyMetrics);

        const req = new MockRequest('GET', '/metrics');
        const res = new MockResponse();

        await server.listeners('request')[0](req, res);

        assert.strictEqual(res.statusCode, 500, 'Should return 500 on error');
        assert.strictEqual(res.body, 'Internal Server Error in metrics endpoint', 'Should return error message');
      } finally {
        http.Server.prototype.listen = originalListen;
      }
    });
  });
});
