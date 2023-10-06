import path from 'path';
import builder from '../src/api';
import taskcluster from 'taskcluster-client';
import load from '../src/main';
import { withDb, stickyLoader, Secrets, fakeauth, withMonitor } from 'taskcluster-lib-testing';

const testclients = {
  'test-client': ['*'],
  'test-server': ['*'],
};

export const suiteName = path.basename;
export const rootUrl = 'http://localhost:60415';
export const load = stickyLoader(load);

suiteSetup(async function() {
  exports.load.inject('profile', 'test');
  exports.load.inject('process', 'test');
});

withMonitor(exports);

// set up the testing secrets
export const secrets = new Secrets({
  secrets: {},
  load: exports.load,
});

export const withDb = (mock, skipping) => {
  withDb(mock, skipping, exports, 'purge_cache');
};

/**
 * Set up an API server.
 */
export const withServer = (mock, skipping) => {
  let webServer;
  let cachePurgeCache = {};

  suiteSetup(async function() {
    if (skipping()) {
      return;
    }
    exports.load.save();

    await load('cfg');

    // even if we are using a "real" rootUrl for access to Azure, we use
    // a local rootUrl to test the API, including mocking auth on that
    // rootUrl.
    exports.load.cfg('taskcluster.rootUrl', exports.rootUrl);
    exports.load.cfg('taskcluster.clientId', null);
    exports.load.cfg('taskcluster.accessToken', null);
    fakeauth.start(testclients, { rootUrl: exports.rootUrl });

    export const PurgeCacheClient = taskcluster.createClient(builder.reference());

    exports.load.inject('cachePurgeCache', cachePurgeCache);

    export const apiClient = new exports.PurgeCacheClient({
      credentials: {
        clientId: 'test-client',
        accessToken: 'doesnt-matter',
      },
      retries: 0,
      rootUrl: exports.rootUrl,
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
    fakeauth.stop();
    exports.load.restore();
  });
};
