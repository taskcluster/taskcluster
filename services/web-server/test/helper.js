const load = require('../src/main');
const {stickyLoader, withMonitor, Secrets, withEntity} = require('taskcluster-lib-testing');
const libUrls = require('taskcluster-lib-urls');
const Session = require('../src/entities/Session');

exports.load = stickyLoader(load);

suiteSetup(async function() {
  exports.load.inject('profile', 'test');
  exports.load.inject('process', 'test');
});

withMonitor(exports);

// Set up the testing sessions
exports.sessions = new Secrets({
  secretName: 'project/taskcluster/testing/taskcluster-web-server',
  secrets: {
    taskcluster: [
      {env: 'TASKCLUSTER_ROOT_URL', cfg: 'taskcluster.rootUrl', name: 'rootUrl', mock: libUrls.testRootUrl()},
      {env: 'TASKCLUSTER_CLIENT_ID', cfg: 'taskcluster.credentials.clientId', name: 'clientId'},
      {env: 'TASKCLUSTER_ACCESS_TOKEN', cfg: 'taskcluster.credentials.accessToken', name: 'accessToken'},
    ],
  },
  load: exports.load,
});

/**
 * Set helper.<Class> for each of the Azure entities used in the service
 */
exports.withEntities = (mock, skipping) => {
  withEntity(mock, skipping, exports, 'Session', Session);
};

exports.withServer = (mock, skipping) => {
  let webServer;

  suiteSetup('withServer', async function() {
    if (skipping()) {
      return;
    }
    const cfg = await exports.load('cfg');

    webServer = await exports.load('httpServer');
    await new Promise((resolve, reject) => {
      webServer.once('error', reject);
      webServer.listen(cfg.server.port, function() {
        resolve();
      });
    });

    exports.serverPort = cfg.server.port;
  });

  suiteTeardown(async function() {
    if (skipping()) {
      return;
    }
    if (webServer) {
      await new Promise(resolve => webServer.close(resolve));
      webServer = null;
    }
  });
};

/**
 * Run various expiration loader components
 */
exports.runExpiration = async component => {
  exports.load.save();
  try {
    return await exports.load(component);
  } finally {
    exports.load.restore();
  }
};
