const path = require('path');
const builder = require('../src/api');
const taskcluster = require('taskcluster-client');
const load = require('../src/main');
const {withDb, stickyLoader, Secrets, fakeauth, withMonitor} = require('taskcluster-lib-testing');

const testclients = {
  'test-client': ['*'],
  'test-server': ['*'],
};

exports.suiteName = path.basename;
exports.rootUrl = 'http://localhost:60415';

exports.load = stickyLoader(load);

suiteSetup(async function() {
  exports.load.inject('profile', 'test');
  exports.load.inject('process', 'test');
});

withMonitor(exports);

// set up the testing secrets
exports.secrets = new Secrets({
  secrets: {
    db: withDb.secret,
  },
  load: exports.load,
});

exports.withDb = (mock, skipping) => {
  withDb(mock, skipping, exports, 'purge_cache');
};

/**
 * Set up an API server.
 */
exports.withServer = (mock, skipping) => {
  let webServer;
  let cachePurgeCache = {};

  suiteSetup(async function() {
    if (skipping()) {
      return;
    }
    exports.load.save();

    await exports.load('cfg');

    // even if we are using a "real" rootUrl for access to Azure, we use
    // a local rootUrl to test the API, including mocking auth on that
    // rootUrl.
    exports.load.cfg('taskcluster.rootUrl', exports.rootUrl);
    exports.load.cfg('taskcluster.clientId', null);
    exports.load.cfg('taskcluster.accessToken', null);
    fakeauth.start(testclients, {rootUrl: exports.rootUrl});

    exports.PurgeCacheClient = taskcluster.createClient(builder.reference());

    exports.load.inject('cachePurgeCache', cachePurgeCache);

    exports.apiClient = new exports.PurgeCacheClient({
      credentials: {
        clientId: 'test-client',
        accessToken: 'doesnt-matter',
      },
      retries: 0,
      rootUrl: exports.rootUrl,
    });

    webServer = await exports.load('server');
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
