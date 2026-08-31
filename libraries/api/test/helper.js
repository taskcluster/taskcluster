import testing from '@taskcluster/lib-testing';
import SchemaSet from '@taskcluster/lib-validate';
import { MonitorManager } from '@taskcluster/lib-monitor';
import assert from 'node:assert';
import path from 'node:path';
import { App } from '@taskcluster/lib-app';

const __dirname = new URL('.', import.meta.url).pathname;
let runningServer = null;

const helper = {
  // Set by setupServer before the test HTTP server starts.
  rootUrl: 'http://127.0.0.1:1',
};
export default helper;

export let monitor = null;
export let monitorManager = null;

suiteSetup('set up monitorManager', async () => {
  monitor = MonitorManager.setup({
    serviceName: 'lib-api',
    fake: true,
    debug: true,
    verify: true,
    level: 'debug',
  });
  monitorManager = monitor.manager;
});

teardown(() => {
  monitorManager.reset();
});

/**
 * Set up a testing server on an ephemeral port serving the given API.
 */
export const setupServer = async ({ builder, context }) => {
  const port = await testing.getFreePort();
  helper.rootUrl = `http://127.0.0.1:${port}`;

  testing.fakeauth.start(
    {
      'client-with-aa-bb-dd': ['aa', 'bb', 'dd'],
    },
    { rootUrl: helper.rootUrl }
  );
  assert(runningServer === null);

  const schemaset = new SchemaSet({
    serviceName: 'test',
    folder: path.join(__dirname, 'schemas'),
  });

  const api = await builder.build({
    rootUrl: helper.rootUrl,
    schemaset,
    monitor,
    context,
  });

  runningServer = await App({
    port,
    env: 'development',
    forceSSL: false,
    trustProxy: false,
    apis: [api],
  });
};
helper.setupServer = setupServer;

export const teardownServer = async () => {
  if (runningServer) {
    await new Promise(accept => {
      runningServer.once('close', () => {
        runningServer = null;
        accept();
      });
      runningServer.close();
    });
  }
  testing.fakeauth.stop();
};
helper.teardownServer = teardownServer;
