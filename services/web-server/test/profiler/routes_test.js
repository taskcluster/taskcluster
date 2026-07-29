import assert from 'node:assert';
import http from 'node:http';
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

suite('profiler/routes', () => {
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
      runs: [
        {
          runId: 0,
          state: 'completed',
          started: '2024-01-01T10:00:00.000Z',
          resolved: '2024-01-01T10:05:00.000Z',
          reasonCreated: 'scheduled',
          reasonResolved: 'completed',
        },
      ],
    },
  };
  const runningTask = {
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
      runs: [
        {
          runId: 0,
          state: 'running',
          started: '2024-01-01T10:00:00.000Z',
          resolved: null,
          reasonCreated: 'scheduled',
          reasonResolved: null,
        },
      ],
    },
  };

  suite('task group profile endpoint', () => {
    let server, port;

    suiteSetup(async () => {
      const app = await createTestApp(() => ({
        queue: {
          listTaskGroup: async () => ({ tasks: [completedTask] }),
        },
      }));
      ({ server, port } = await startServer(app));
    });

    suiteTeardown(done => {
      server.close(done);
    });

    test('returns a valid profile for a task group', async () => {
      const res = await request
        .get(`http://localhost:${port}/api/web-server/v1/task-group/${VALID_SLUGID}/profile`)
        .ok(() => true);

      assert.equal(res.status, 200);
      assert.equal(res.body.meta.version, 27);
      assert(res.body.threads.length > 0);
      assert.equal(res.headers['access-control-allow-origin'], '*');
      assert.equal(res.headers['cache-control'], 'public, max-age=86400');
    });

    test('returns 400 for invalid task group ID', async () => {
      const res = await request
        .get(`http://localhost:${port}/api/web-server/v1/task-group/not valid!/profile`)
        .ok(() => true);

      assert.equal(res.status, 400);
      assert.equal(res.body.code, 'InvalidRequestArguments');
    });
  });

  suite('cache headers', () => {
    let server, port;

    suiteSetup(async () => {
      const app = await createTestApp(() => ({
        queue: {
          listTaskGroup: async () => ({
            tasks: [runningTask],
          }),
        },
      }));
      ({ server, port } = await startServer(app));
    });

    suiteTeardown(done => {
      server.close(done);
    });

    test('returns no-cache for running tasks', async () => {
      const res = await request
        .get(`http://localhost:${port}/api/web-server/v1/task-group/${VALID_SLUGID}/profile`)
        .ok(() => true);

      assert.equal(res.status, 200);
      assert.equal(res.headers['cache-control'], 'no-cache');
    });
  });

  suite('error handling', () => {
    let server, port;

    suiteSetup(async () => {
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

    suiteTeardown(done => {
      server.close(done);
    });

    test('returns 404 when task group not found', async () => {
      const res = await request
        .get(`http://localhost:${port}/api/web-server/v1/task-group/${VALID_SLUGID}/profile`)
        .ok(() => true);

      assert.equal(res.status, 404);
      assert.equal(res.body.code, 'ResourceNotFound');
    });

    test('returns 404 when task not found', async () => {
      const res = await request
        .get(`http://localhost:${port}/api/web-server/v1/task/${VALID_SLUGID_2}/profile`)
        .ok(() => true);

      assert.equal(res.status, 404);
      assert.equal(res.body.code, 'ResourceNotFound');
    });
  });

  suite('CORS', () => {
    let server, port;

    suiteSetup(async () => {
      const app = await createTestApp(() => ({ queue: {} }));
      ({ server, port } = await startServer(app));
    });

    suiteTeardown(done => {
      server.close(done);
    });

    test('responds to OPTIONS preflight for task group profile', async () => {
      const res = await request
        .options(`http://localhost:${port}/api/web-server/v1/task-group/${VALID_SLUGID}/profile`)
        .set('Origin', 'https://profiler.firefox.com')
        .set('Access-Control-Request-Method', 'GET')
        .ok(() => true);

      assert.equal(res.headers['access-control-allow-origin'], '*');
    });

    test('responds to OPTIONS preflight for task log profile', async () => {
      const res = await request
        .options(`http://localhost:${port}/api/web-server/v1/task/${VALID_SLUGID}/profile`)
        .set('Origin', 'https://profiler.firefox.com')
        .set('Access-Control-Request-Method', 'GET')
        .ok(() => true);

      assert.equal(res.headers['access-control-allow-origin'], '*');
    });
  });

  // serve artifact content over loopback, as the endpoint downloads it through the client
  async function startArtifactServer(content) {
    const artifactServer = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(content);
    });
    await new Promise(resolve => artifactServer.listen(0, '127.0.0.1', resolve));
    return {
      artifactServer,
      artifactUrl: `http://127.0.0.1:${artifactServer.address().port}/log`,
    };
  }

  suite('task log profile endpoint', () => {
    const logContent = [
      '[taskcluster:info 2024-01-01T10:00:00.000Z] Starting task',
      '[setup:warn 2024-01-01T10:00:01.000Z] Installing dependencies',
      '[taskcluster:info 2024-01-01T10:00:05.000Z] Task complete',
    ].join('\n');

    let server, port, artifactServer;

    suiteSetup(async () => {
      let artifactUrl;
      ({ artifactServer, artifactUrl } = await startArtifactServer(logContent));

      const app = await createTestApp(() => ({
        queue: {
          task: async () => completedTask.task,
          status: async () => ({ status: completedTask.status }),
          latestArtifact: async () => ({ storageType: 's3', url: artifactUrl }),
        },
      }));
      ({ server, port } = await startServer(app));
    });

    suiteTeardown(done => {
      artifactServer.close();
      server.close(done);
    });

    test('returns gzip-compressed profile', async () => {
      const res = await request
        .get(`http://localhost:${port}/api/web-server/v1/task/${VALID_SLUGID_2}/profile`)
        .buffer(true)
        .parse(request.parse['application/octet-stream'])
        .ok(() => true);

      assert.equal(res.status, 200);
      assert.equal(res.headers['content-encoding'], 'gzip');

      // superagent auto-decompresses gzip, so res.body is already plain data
      const profile = JSON.parse(res.body.toString());
      assert.equal(profile.meta.version, 27);
      assert.equal(profile.threads.length, 1);
      assert.equal(profile.threads[0].name, 'Live Log');
    });

    test('returns cache headers for completed task', async () => {
      const res = await request
        .get(`http://localhost:${port}/api/web-server/v1/task/${VALID_SLUGID_2}/profile`)
        .buffer(true)
        .parse(request.parse['application/octet-stream'])
        .ok(() => true);

      assert.equal(res.headers['cache-control'], 'public, max-age=86400');
    });
  });

  suite('task log fallback', () => {
    const logContent = '[taskcluster:info 2024-01-01T10:00:00.000Z] Starting task\n';
    let server, port, artifactServer, requested;

    suiteSetup(async () => {
      let artifactUrl;
      ({ artifactServer, artifactUrl } = await startArtifactServer(logContent));

      const app = await createTestApp(() => ({
        queue: {
          task: async () => completedTask.task,
          status: async () => ({ status: completedTask.status }),
          latestArtifact: async (_taskId, name) => {
            requested.push(name);
            if (name === 'public/logs/live.log') {
              return { storageType: 'reference', url: 'http://169.254.169.254/metadata' };
            }
            return { storageType: 's3', url: artifactUrl };
          },
        },
      }));
      ({ server, port } = await startServer(app));
    });

    setup(() => {
      requested = [];
    });

    suiteTeardown(done => {
      artifactServer.close();
      server.close(done);
    });

    test('does not fetch a reference live.log, and profiles live_backing.log instead', async () => {
      const res = await request
        .get(`http://localhost:${port}/api/web-server/v1/task/${VALID_SLUGID_2}/profile`)
        .buffer(true)
        .parse(request.parse['application/octet-stream'])
        .ok(() => true);

      assert.equal(res.status, 200);
      assert.deepEqual(requested, ['public/logs/live.log', 'public/logs/live_backing.log']);

      const profile = JSON.parse(res.body.toString());
      assert.equal(profile.threads.length, 1);
    });
  });

  suite('task log profile with no readable log', () => {
    let server, port;

    suiteSetup(async () => {
      const app = await createTestApp(() => ({
        queue: {
          task: async () => completedTask.task,
          status: async () => ({ status: completedTask.status }),
          // every log artifact is a reference, so none may be fetched
          latestArtifact: async () => ({ storageType: 'reference', url: 'http://169.254.169.254/metadata' }),
        },
      }));
      ({ server, port } = await startServer(app));
    });

    suiteTeardown(done => server.close(done));

    test('returns 404 when no log artifact may be fetched', async () => {
      const res = await request
        .get(`http://localhost:${port}/api/web-server/v1/task/${VALID_SLUGID_2}/profile`)
        .ok(() => true);

      assert.equal(res.status, 404);
    });
  });

  suite('running task log profile with no readable log', () => {
    let server, port;

    suiteSetup(async () => {
      const app = await createTestApp(() => ({
        queue: {
          task: async () => runningTask.task,
          status: async () => ({ status: runningTask.status }),
          latestArtifact: async () => ({ storageType: 's3', url: 'xx' }),
        },
      }));
      ({ server, port } = await startServer(app));
    });

    suiteTeardown(done => server.close(done));

    test('returns 404 when no log artifact may be fetched and task is running', async () => {
      const res = await request
        .get(`http://localhost:${port}/api/web-server/v1/task/${VALID_SLUGID_2}/profile`)
        .ok(() => true);

      assert.equal(res.status, 404);
      assert.match(res.body.message, /Profiling is only supported on resolved tasks/);
    });
  });
});
