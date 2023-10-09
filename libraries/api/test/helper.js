import testing from 'taskcluster-lib-testing';
import SchemaSet from 'taskcluster-lib-validate';
import { MonitorManager } from 'taskcluster-lib-monitor';
import assert from 'assert';
import path from 'path';
import url from 'url';
import { App } from 'taskcluster-lib-app';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
let runningServer = null;

export const rootUrl = 'http://localhost:23525';

export let monitor = null;
export let monitorManager = null;

suiteSetup('set up monitorManager', async function() {
  monitor = MonitorManager.setup({
    serviceName: 'lib-api',
    fake: true,
    debug: true,
    verify: true,
    level: 'debug',
  });
  monitorManager = monitor.manager;
});

teardown(function() {
  monitorManager.reset();
});

/**
 * Set up a testing server on port 23525 serving the given API.
 */
export const setupServer = async ({ builder, context }) => {
  testing.fakeauth.start({
    'client-with-aa-bb-dd': ['aa', 'bb', 'dd'],
  }, { rootUrl });
  assert(runningServer === null);

  const schemaset = new SchemaSet({
    serviceName: 'test',
    folder: path.join(__dirname, 'schemas'),
  });

  const api = await builder.build({
    rootUrl,
    schemaset,
    monitor,
    context,
  });

  runningServer = await App({
    port: 23525,
    env: 'development',
    forceSSL: false,
    trustProxy: false,
    apis: [api],
  });
};

export const teardownServer = async () => {
  if (runningServer) {
    await new Promise(function(accept) {
      runningServer.once('close', function() {
        runningServer = null;
        accept();
      });
      runningServer.close();
    });
  }
  testing.fakeauth.stop();
};

export default { rootUrl, setupServer, teardownServer };
