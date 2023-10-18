import path from 'path';
import builder from '../src/api.js';
import taskcluster from 'taskcluster-client';
import loadMain from '../src/main.js';
import testing from 'taskcluster-lib-testing';

const testclients = {
  'test-client': ['*'],
  'test-server': ['*'],
};

const suiteName = path.basename;
const rootUrl = 'http://localhost:60415';
const load = testing.stickyLoader(loadMain);

const helper = { load, rootUrl, suiteName };
export default helper;

suiteSetup(async function() {
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
helper.withServer = (mock, skipping) => {
  let webServer;
  let cachePurgeCache = {};

  suiteSetup(async function() {
    if (skipping()) {
      return;
    }
    load.save();

    await load('cfg');

    // even if we are using a "real" rootUrl for access to Azure, we use
    // a local rootUrl to test the API, including mocking auth on that
    // rootUrl.
    load.cfg('taskcluster.rootUrl', rootUrl);
    load.cfg('taskcluster.clientId', null);
    load.cfg('taskcluster.accessToken', null);
    testing.fakeauth.start(testclients, { rootUrl });

    helper.PurgeCacheClient = taskcluster.createClient(builder.reference());

    load.inject('cachePurgeCache', cachePurgeCache);

    helper.apiClient = new helper.PurgeCacheClient({
      credentials: {
        clientId: 'test-client',
        accessToken: 'doesnt-matter',
      },
      retries: 0,
      rootUrl,
    });

    webServer = await load('server');
  });

  setup(function() {
    Object.keys(cachePurgeCache).forEach(k => delete cachePurgeCache[k]);
  });

  suiteTeardown(async function() {
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
