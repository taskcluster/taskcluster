import assert from 'assert';
import express from 'express';
import request from 'superagent';
import builder from '../../src/api.js';
import SchemaSet from '@taskcluster/lib-validate';
import { MonitorManager } from '@taskcluster/lib-monitor';
import '../../src/monitor.js';

const VALID_SLUGID = 'dSlITZ4yQgmvxxAi4A8fHQ';
const VALID_SLUGID_2 = 'YsJwVJjqTN2a2sSeawNFQw';

/**
 * Lightweight Express app for testing profiler routes via lib-api
 * without needing the full web-server setup (no DB, auth, or GraphQL).
 */
async function createTestApp(mockClients) {
  const schemaset = new SchemaSet({ serviceName: 'web-server' });
  const monitor = MonitorManager.setup({
    serviceName: 'web-server',
    fake: true,
    debug: false,
  });
  const api = await builder.build({
    rootUrl: 'https://tc.test',
    context: { clients: mockClients, rootUrl: 'https://tc.test' },
    schemaset,
    monitor: monitor.childMonitor('api'),
  });
  const app = express();
  api.express(app);
  return app;
}

function startServer(app) {
  return new Promise(resolve => {
    const server = app.listen(0, () => {
      resolve({ server, port: server.address().port });
    });
  });
}

suite('profiler/routes', function() {
  const completedTask = {
    task: {
      schedulerId: 'test-scheduler',
      expires: '2025-01-01T00:00:00.000Z',
      metadata: {
        name: 'Test Task',
        description: 'A test',
        owner: 'test@example.com',
        source: 'https://example.com',
      },
      retries: 1,
      taskGroupId: VALID_SLUGID,
      dependencies: [],
    },
    status: {
      taskId: 'test-task-id',
      state: 'completed',
      runs: [{
        runId: 0,
        state: 'completed',
        started: '2024-01-01T10:00:00.000Z',
        resolved: '2024-01-01T10:05:00.000Z',
        reasonCreated: 'scheduled',
        reasonResolved: 'completed',
      }],
    },
  };

  suite('task group profile endpoint', function() {
    let server, port;

    suiteSetup(async function() {
      const app = await createTestApp(() => ({
        queue: {
          listTaskGroup: async () => ({ tasks: [completedTask] }),
        },
      }));
      ({ server, port } = await startServer(app));
    });

    suiteTeardown(function(done) {
      server.close(done);
    });

    test('returns a valid profile for a task group', async function() {
      const res = await request
        .get(`http://localhost:${port}/api/web-server/v1/task-group/${VALID_SLUGID}/profile`)
        .ok(() => true);

      assert.equal(res.status, 200);
      assert.equal(res.body.meta.version, 27);
      assert(res.body.threads.length > 0);
      assert.equal(res.headers['access-control-allow-origin'], '*');
      assert.equal(res.headers['cache-control'], 'public, max-age=86400');
    });

    test('returns 400 for invalid task group ID', async function() {
      const res = await request
        .get(`http://localhost:${port}/api/web-server/v1/task-group/not valid!/profile`)
        .ok(() => true);

      assert.equal(res.status, 400);
      assert.equal(res.body.code, 'InvalidRequestArguments');
    });
  });

  suite('cache headers', function() {
    let server, port;

    suiteSetup(async function() {
      const app = await createTestApp(() => ({
        queue: {
          listTaskGroup: async () => ({
            tasks: [{
              task: {
                schedulerId: 'sched',
                expires: '2025-01-01T00:00:00.000Z',
                metadata: { name: 'Running', description: '', owner: '', source: '' },
                retries: 1,
                taskGroupId: VALID_SLUGID,
                dependencies: [],
              },
              status: {
                taskId: 'running-task',
                state: 'running',
                runs: [{
                  runId: 0,
                  state: 'running',
                  started: '2024-01-01T10:00:00.000Z',
                  resolved: null,
                  reasonCreated: 'scheduled',
                  reasonResolved: null,
                }],
              },
            }],
          }),
        },
      }));
      ({ server, port } = await startServer(app));
    });

    suiteTeardown(function(done) {
      server.close(done);
    });

    test('returns no-cache for running tasks', async function() {
      const res = await request
        .get(`http://localhost:${port}/api/web-server/v1/task-group/${VALID_SLUGID}/profile`)
        .ok(() => true);

      assert.equal(res.status, 200);
      assert.equal(res.headers['cache-control'], 'no-cache');
    });
  });

  suite('error handling', function() {
    let server, port;

    suiteSetup(async function() {
      const app = await createTestApp(() => ({
        queue: {
          listTaskGroup: async () => {
            const err = new Error('No such task group');
            err.statusCode = 404;
            throw err;
          },
          task: async () => {
            const err = new Error('No such task');
            err.statusCode = 404;
            throw err;
          },
          status: async () => {
            const err = new Error('No such task');
            err.statusCode = 404;
            throw err;
          },
        },
      }));
      ({ server, port } = await startServer(app));
    });

    suiteTeardown(function(done) {
      server.close(done);
    });

    test('returns 404 when task group not found', async function() {
      const res = await request
        .get(`http://localhost:${port}/api/web-server/v1/task-group/${VALID_SLUGID}/profile`)
        .ok(() => true);

      assert.equal(res.status, 404);
      assert.equal(res.body.code, 'ResourceNotFound');
    });

    test('returns 404 when task not found', async function() {
      const res = await request
        .get(`http://localhost:${port}/api/web-server/v1/task/${VALID_SLUGID_2}/profile`)
        .ok(() => true);

      assert.equal(res.status, 404);
      assert.equal(res.body.code, 'ResourceNotFound');
    });
  });

  suite('CORS', function() {
    let server, port;

    suiteSetup(async function() {
      const app = await createTestApp(() => ({ queue: {} }));
      ({ server, port } = await startServer(app));
    });

    suiteTeardown(function(done) {
      server.close(done);
    });

    test('responds to OPTIONS preflight for task group profile', async function() {
      const res = await request
        .options(`http://localhost:${port}/api/web-server/v1/task-group/${VALID_SLUGID}/profile`)
        .set('Origin', 'https://profiler.firefox.com')
        .set('Access-Control-Request-Method', 'GET')
        .ok(() => true);

      assert.equal(res.headers['access-control-allow-origin'], '*');
    });

    test('responds to OPTIONS preflight for task log profile', async function() {
      const res = await request
        .options(`http://localhost:${port}/api/web-server/v1/task/${VALID_SLUGID}/profile`)
        .set('Origin', 'https://profiler.firefox.com')
        .set('Access-Control-Request-Method', 'GET')
        .ok(() => true);

      assert.equal(res.headers['access-control-allow-origin'], '*');
    });
  });
});
