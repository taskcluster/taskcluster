const load = require('../src/main');
const taskcluster = require('taskcluster-client');
const {Secrets, stickyLoader, withMonitor, withEntity} = require('taskcluster-lib-testing');
const sinon = require('sinon');
const AuthorizationCode = require('../src/data/AuthorizationCode');
const AccessToken = require('../src/data/AccessToken');
const GithubAccessToken = require('../src/data/GithubAccessToken');
const GithubClient = require('../src/login/clients/GithubClient');
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
  secretName: 'project/taskcluster/testing/azure',
  secrets: {
    azure: withEntity.secret,
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

exports.githubFixtures = {
  users: {
    'octocat': 10,
    'taskcluster': 20,
    'a/c': 30,
  },
  teams: {
    'octocat': [
      { slug: 'team-1', organization: { login: 'taskcluster'} },
      { slug: 'team-2', organization: { login: 'neutrinojs'} },
    ],
    'taskcluster': [
      { slug: 'team-3', organization: { login: 'taskcluster'} },
      { slug: 'team-1', organization: { login: 'neutrinojs'} },
    ],
    'a/c': [],
  },
  orgs: {
    'octocat': [
      { role: 'admin', organization: { login: 'taskcluster' } },
      { role: 'member', organization: { login: 'neutrinojs' } },
    ],
    'taskcluster': [
      { role: 'admin', organization: { login: 'taskcluster' } },
      { role: 'admin', organization: { login: 'neutrinojs' } },
    ],
    'a/c': [],
  },
};

exports.withGithubClient = () => {
  function githubClient() {
    let currentUsername = null;

    return {
      async userFromUsername(username) {
        currentUsername = username;

        if (username === 'FAIL') {
          throw new Error('uhoh');
        }

        const user_id = exports.githubFixtures.users[username];

        if (!user_id) {
          const err = new Error('No such user');
          err.status = 404;
          throw err;
        }

        return {id: user_id};
      },
      async userMembershipsOrgs() {
        const organizations = exports.githubFixtures.orgs[currentUsername];

        if (!organizations) {
          throw new Error(`memberships orgs for user ${currentUsername} not found`);
        }

        return organizations;
      },
      async listTeams() {
        const userTeams = exports.githubFixtures.teams[currentUsername];

        if (!userTeams) {
          throw new Error(`orgs for user ${currentUsername} not found`);
        }

        return userTeams;
      },
    };
  }

  suiteSetup(function() {
    this.stubbedGithuClient = {};

    Object.entries(githubClient()).forEach(([name, value]) => {
      this.stubbedGithuClient[name] = sinon.stub(GithubClient.prototype, name).callsFake(value);
    });
  });

  suiteTeardown(function() {
    Object.values(this.stubbedGithuClient).map(stub => stub.restore());
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
