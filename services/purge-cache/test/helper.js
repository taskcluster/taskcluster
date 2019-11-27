const path = require('path');
const builder = require('../src/api');
const data = require('../src/data');
const taskcluster = require('taskcluster-client');
const load = require('../src/main');
const {stickyLoader, Secrets, fakeauth, withEntity, withMonitor} = require('taskcluster-lib-testing');

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
  secretName: 'project/taskcluster/testing/azure',
  secrets: {
    azure: withEntity.secret,
  },
  load: exports.load,
});

/**
 * Set helper.<Class> for each of the Azure entities used in the service
 */
exports.withEntities = (mock, skipping, options = {}) => {
  withEntity(mock, skipping, exports, 'CachePurge', data.CachePurge);
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
