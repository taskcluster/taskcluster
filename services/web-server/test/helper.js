const load = require('../src/main');
const taskcluster = require('taskcluster-client');
const {Secrets, stickyLoader, withMonitor, withEntity} = require('taskcluster-lib-testing');
const AuthorizationCode = require('../src/data/AuthorizationCode');
const AccessToken = require('../src/data/AccessToken');
const GithubAccessToken = require('../src/data/GithubAccessToken');
const libUrls = require('taskcluster-lib-urls');
const request = require('superagent');

exports.load = stickyLoader(load);

suiteSetup(async function() {
  exports.load.inject('profile', 'test');
  exports.load.inject('process', 'test');
});

withMonitor(exports);

exports.rootUrl = libUrls.testRootUrl();

// set up the testing secrets
exports.secrets = new Secrets({
  secretName: 'project/taskcluster/testing/taskcluster-web-server',
  secrets: {
    taskcluster: [
      {env: 'TASKCLUSTER_ROOT_URL', cfg: 'taskcluster.rootUrl', name: 'rootUrl',
        mock: exports.rootUrl},
      {env: 'TASKCLUSTER_CLIENT_ID', cfg: 'taskcluster.credentials.clientId', name: 'clientId'},
      {env: 'TASKCLUSTER_ACCESS_TOKEN', cfg: 'taskcluster.credentials.accessToken', name: 'accessToken'},
    ],
  },
  load: exports.load,
});

exports.withEntities = (mock, skipping) => {
  withEntity(mock, skipping, exports, 'AuthorizationCode', AuthorizationCode);
  withEntity(mock, skipping, exports, 'AccessToken', AccessToken);
  withEntity(mock, skipping, exports, 'GithubAccessToken', GithubAccessToken);
};

exports.withFakeAuth = (mock, skipping) => {
  suiteSetup('withFakeAuth', function() {
    if (skipping()) {
      return;
    }

    exports.load.inject('auth', stubbedAuth());
  });
};

exports.withServer = (mock, skipping) => {
  let webServer;

  // return a signed-in Superagent agent
  const signedInAgent = async () => {
    const agent = request.agent();
    await agent.get(`http://127.0.0.1:${exports.serverPort}/login/test`);
    return agent;
  };

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
    exports.signedInAgent = signedInAgent;

    exports.load.cfg('app.publicUrl', `http://127.0.0.1:${exports.serverPort}`);
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

const stubbedAuth = () => {
  const auth = new taskcluster.Auth({
    rootUrl: exports.rootUrl,
    credentials: {
      clientId: 'index-server',
      accessToken: 'none',
    },
    fake: {
      createClient: async (clientId, input) => {
        return Promise.resolve({
          clientId,
          accessToken: 'fake-access-token',
          ...input,
        });
      },
      resetAccessToken(clientId) {
        return Promise.resolve({ clientId, accessToken: taskcluster.slugid() });
      },
    },
  });

  return auth;
};
