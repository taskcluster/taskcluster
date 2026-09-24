import assert from 'node:assert';
import load from '../src/main.js';
import taskcluster from '@taskcluster/client';
import {
  Secrets,
  stickyLoader,
  withMonitor,
  withPulse,
  withDb,
  resetTables,
  getFreePort,
} from '@taskcluster/lib-testing';
import sinon from 'sinon';
import GithubClient from '../src/login/clients/GithubClient.js';
import libUrls from 'taskcluster-lib-urls';
import request from 'superagent';

const helper = {};
export default helper;
helper.load = stickyLoader(load);

suiteSetup(async () => {
  helper.load.inject('profile', 'test');
  helper.load.inject('process', 'test');
});

withMonitor(helper);

/** @param {string} errorCode */
helper.expectMonitorError = async errorCode => {
  const monitor = await helper.load('monitor');
  const errorMessage = monitor.manager.messages.find(msg => {
    const Fields = msg.Fields;
    return (Fields?.code || Fields?.name) === errorCode;
  });
  assert.ok(errorMessage, `Expected to find monitor error with code: ${errorCode}`);
  // Clear only the error message we found, keeping others for the teardown check
  const errorIndex = monitor.manager.messages.indexOf(errorMessage);
  monitor.manager.messages.splice(errorIndex, 1);
};

helper.rootUrl = libUrls.testRootUrl();

// set up the testing secrets
helper.secrets = new Secrets({
  secrets: {},
  load: helper.load,
});

helper.withDb = (mock, skipping) => {
  withDb(mock, skipping, helper, 'web_server');
};

helper.withPulse = (helper, skipping) => {
  withPulse({ helper, skipping, namespace: 'taskcluster-web-server' });
};

helper.withFakeAuth = skipping => {
  suiteSetup('withFakeAuth', () => {
    if (skipping()) {
      return;
    }

    helper.load.inject('auth', stubbedAuth());
  });
};

helper.withFakeAuthFactory = skipping => {
  suiteSetup('withFakeAuthFactory', () => {
    if (skipping()) {
      return;
    }

    helper.load.inject('authFactory', stubbedAuthFactory());
  });

  suiteTeardown(() => {
    helper.load.remove('authFactory');
  });
};

helper.withServer = skipping => {
  let webServer;

  // return a signed-in Superagent agent
  const signedInAgent = async () => {
    const agent = request.agent();
    await agent.get(`http://127.0.0.1:${helper.serverPort}/login/test`);
    return agent;
  };

  suiteSetup('withServer', async () => {
    if (skipping()) {
      return;
    }
    await helper.load('cfg');

    // Use an ephemeral port so parallel or overlapping test suites do not
    // collide on a fixed port (see taskcluster/taskcluster#3665).
    const port = await getFreePort();
    helper.load.cfg('server.port', port);
    helper.serverPort = port;

    webServer = await helper.load('httpServer');
    await new Promise((resolve, reject) => {
      webServer.once('error', reject);
      webServer.listen(port, () => {
        resolve();
      });
    });

    helper.signedInAgent = signedInAgent;

    helper.load.cfg('app.publicUrl', `http://127.0.0.1:${helper.serverPort}`);
  });

  suiteTeardown(async () => {
    if (skipping()) {
      return;
    }
    if (webServer) {
      await new Promise(resolve => {
        webServer.close(resolve);
        webServer.closeAllConnections();
      });
      webServer = null;
    }
  });
};

helper.githubFixtures = {
  users: {
    octocat: 10,
    taskcluster: 20,
    'a/c': 30,
  },
  teams: {
    octocat: [
      { slug: 'team-1', organization: { login: 'taskcluster' } },
      { slug: 'team-2', organization: { login: 'neutrinojs' } },
    ],
    taskcluster: [
      { slug: 'team-3', organization: { login: 'taskcluster' } },
      { slug: 'team-1', organization: { login: 'neutrinojs' } },
    ],
    'a/c': [],
  },
  orgs: {
    octocat: [
      { role: 'admin', organization: { login: 'taskcluster' } },
      { role: 'member', organization: { login: 'neutrinojs' } },
    ],
    taskcluster: [
      { role: 'admin', organization: { login: 'taskcluster' } },
      { role: 'admin', organization: { login: 'neutrinojs' } },
    ],
    'a/c': [],
  },
};

helper.withGithubClient = () => {
  function githubClient() {
    let currentUsername = null;

    return {
      async userFromUsername(username) {
        currentUsername = username;

        if (username === 'FAIL') {
          throw new Error('uhoh');
        }

        const user_id = helper.githubFixtures.users[username];

        if (!user_id) {
          const err = new Error('No such user');
          err.status = 404;
          throw err;
        }

        return { id: user_id };
      },
      async userMembershipsOrgs() {
        const organizations = helper.githubFixtures.orgs[currentUsername];

        if (!organizations) {
          throw new Error(`memberships orgs for user ${currentUsername} not found`);
        }

        return organizations;
      },
      async listTeams() {
        const userTeams = helper.githubFixtures.teams[currentUsername];

        if (!userTeams) {
          throw new Error(`orgs for user ${currentUsername} not found`);
        }

        return userTeams;
      },
    };
  }

  suiteSetup(function () {
    this.stubbedGithuClient = {};

    Object.entries(githubClient()).forEach(([name, value]) => {
      this.stubbedGithuClient[name] = sinon.stub(GithubClient.prototype, name).callsFake(value);
    });
  });

  suiteTeardown(function () {
    Object.values(this.stubbedGithuClient).map(stub => stub.restore());
  });
};

const stubbedAuth = () => {
  const auth = new taskcluster.Auth({
    rootUrl: helper.rootUrl,
    fake: {
      createClient: async (clientId, input) => {
        return Promise.resolve({
          clientId,
          accessToken: 'fake-access-token',
          ...input,
        });
      },
      expandScopes({ scopes }) {
        return { scopes };
      },
      resetAccessToken(clientId) {
        return Promise.resolve({ clientId, accessToken: taskcluster.slugid() });
      },
    },
  });

  return auth;
};

const stubbedAuthFactory = () => {
  return () =>
    new taskcluster.Auth({
      rootUrl: helper.rootUrl,
      fake: {
        currentScopes: async () => ({ scopes: ['web:read-pulse'] }),
      },
    });
};

helper.resetTables = () => {
  setup('reset tables', async () => {
    await resetTables({ tableNames: ['authorization_codes', 'access_tokens', 'sessions', 'github_access_tokens'] });
  });
};
