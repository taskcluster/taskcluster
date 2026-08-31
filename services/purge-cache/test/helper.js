import path from 'node:path';
import builder from '../src/api.js';
import taskcluster from '@taskcluster/client';
import loadMain from '../src/main.js';
import testing from '@taskcluster/lib-testing';

const testclients = {
  'test-client': ['*'],
  'test-server': ['*'],
};

const suiteName = path.basename;
const load = testing.stickyLoader(loadMain);

const helper = { load, suiteName };
export default helper;

// Set by withServer before the test HTTP server starts.
helper.rootUrl = 'http://127.0.0.1:1';

suiteSetup(async () => {
  load.inject('profile', 'test');
  load.inject('process', 'test');
});

testing.withMonitor(helper);

// set up the testing secrets
helper.secrets = new testing.Secrets({
  secrets: {},
  load: load,
});

helper.withDb = (mock, skipping) => {
  testing.withDb(mock, skipping, helper, 'purge_cache');
};

/**
 * Set up an API server.
 */
helper.withServer = skipping => {
  let webServer;
  const cachePurgeCache = {};

  suiteSetup(async () => {
    if (skipping()) {
      return;
    }
    load.save();

    await load('cfg');

    // Use an ephemeral port so parallel or overlapping test suites do not
    // collide on a fixed port (see taskcluster/taskcluster#3665).
    const port = await testing.getFreePort();
    helper.rootUrl = `http://127.0.0.1:${port}`;
    load.cfg('server.port', port);
    load.cfg('taskcluster.rootUrl', helper.rootUrl);

    // even if we are using a "real" rootUrl for access to Azure, we use
    // a local rootUrl to test the API, including mocking auth on that
    // rootUrl.
    load.cfg('taskcluster.clientId', null);
    load.cfg('taskcluster.accessToken', null);
    testing.fakeauth.start(testclients, { rootUrl: helper.rootUrl });

    helper.PurgeCacheClient = taskcluster.createClient(builder.reference());

    load.inject('cachePurgeCache', cachePurgeCache);

    helper.apiClient = new helper.PurgeCacheClient({
      credentials: {
        clientId: 'test-client',
        accessToken: 'doesnt-matter',
      },
      retries: 0,
      rootUrl: helper.rootUrl,
    });

    webServer = await load('server');
  });

  setup(() => {
    Object.keys(cachePurgeCache).forEach(k => {
      delete cachePurgeCache[k];
    });
  });

  suiteTeardown(async () => {
    if (skipping()) {
      return;
    }
    if (webServer) {
      await webServer.terminate();
      webServer = null;
    }
    testing.fakeauth.stop();
    load.restore();
  });
};
