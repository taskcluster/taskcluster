const load = require('../src/main');
const taskcluster = require('taskcluster-client');
const {Secrets, stickyLoader, withMonitor, withEntity, withPulse, withDb, resetTables} = require('taskcluster-lib-testing');
const sinon = require('sinon');
const AuthorizationCode = require('../src/data/AuthorizationCode');
const AccessToken = require('../src/data/AccessToken');
const GithubAccessToken = require('../src/data/GithubAccessToken');
const SessionStorage = require('../src/data/SessionStorage');
const GithubClient = require('../src/login/clients/GithubClient');
const libUrls = require('taskcluster-lib-urls');
const request = require('superagent');
const merge = require('deepmerge');
const PulseEngine = require('../src/PulseEngine');
const { WebSocketLink } = require('apollo-link-ws');
const WebSocket = require('ws');
const { SubscriptionClient } = require('subscriptions-transport-ws');
const { ApolloClient } = require('apollo-client');
const { InMemoryCache } = require('apollo-cache-inmemory');
const { HttpLink } = require('apollo-link-http');
const fetch = require('node-fetch');

exports.load = stickyLoader(load);

suiteSetup(async function() {
  exports.load.inject('profile', 'test');
  exports.load.inject('process', 'test');
});

withMonitor(exports);

exports.rootUrl = libUrls.testRootUrl();

// set up the testing secrets
exports.secrets = new Secrets({
  secrets: {
    db: withDb.secret,
  },
  load: exports.load,
});

exports.withEntities = (mock, skipping) => {
  withEntity(mock, skipping, exports, 'AuthorizationCode', AuthorizationCode);
  withEntity(mock, skipping, exports, 'AccessToken', AccessToken);
  withEntity(mock, skipping, exports, 'GithubAccessToken', GithubAccessToken);
  withEntity(mock, skipping, exports, 'SessionStorage', SessionStorage);
};

exports.withDb = (mock, skipping) => {
  withDb(mock, skipping, exports, 'web_server');
};

exports.withPulse = (helper, skipping) => {
  withPulse({helper, skipping, namespace: 'taskcluster-web-server'});
};

exports.withMockedEventIterator = () => {
  let PulseEngineCopy = Object.assign({}, PulseEngine);

  PulseEngineCopy.NextAsyncIterator = null;
  exports.setNextAsyncIterator = (asyncIterator) => {
    PulseEngineCopy.NextAsyncIterator = asyncIterator;
  };

  PulseEngineCopy.eventIterator = (eventName, subscriptions) => {
    if(!PulseEngineCopy.NextAsyncIterator){
      throw new Error(`No async iterator to return. Set one up with SetNextAsyncIterator`);
    }
    return PulseEngineCopy.NextAsyncIterator;
  };

  exports.load.inject('pulseEngine', PulseEngineCopy);

  suiteTeardown(() => {
    exports.load.remove('pulseEngine');
  });
};

exports.withFakeAuth = (mock, skipping) => {
  suiteSetup('withFakeAuth', function() {
    if (skipping()) {
      return;
    }

    exports.load.inject('auth', stubbedAuth());
  });
};

exports.withClients = (mock, skipping) => {
  suiteSetup('withClients', async function() {
    if (skipping()) {
      return;
    }

    const clients = stubbedClients();

    exports.load.inject('clients', clients);
    exports.clients = clients;
  });

  suiteTeardown(function () {
    exports.load.remove('clients');
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

exports.makeTaskDefinition = (options = {}) => merge({
  provisionerId: "no-provisioner-extended-extended",
  workerType: "test-worker-extended-extended",
  schedulerId: "my-scheduler-extended-extended",
  taskGroupId: "dSlITZ4yQgmvxxAi4A8fHQ",
  dependencies: [],
  requires: 'ALL_COMPLETED',
  routes: [],
  priority: 'LOWEST',
  retries: 5,
  created: taskcluster.fromNowJSON(),
  deadline: taskcluster.fromNowJSON('3 days'),
  expires: taskcluster.fromNowJSON('3 days'),
  scopes: [],
  payload: {},
  metadata: {
    name: "Testing task",
    description: "Task created during tests",
    owner: "haali@mozilla.com",
    source: "https://github.com/taskcluster/taskcluster",
  },
  tags: {
    purpose: "taskcluster-testing",
  },
  extra: {},
}, options);

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

exports.getHttpClient = () => {
  const cache = new InMemoryCache();
  const httpLink = new HttpLink({
    uri: `http://localhost:${exports.serverPort}/graphql`,
    fetch,
  });

  return new ApolloClient({ cache, link: httpLink });
};

exports.getWebsocketClient = (subscriptionClient) => {
  const cache = new InMemoryCache();
  const link = new WebSocketLink(subscriptionClient);

  return new ApolloClient({ cache, link });
};

// If a subscription client is created for a test, it also needs to be closed.
// Otherwise, the tests will just hang and timeout
exports.createSubscriptionClient = async () => {
  return new Promise(function(resolve, reject) {
    const subscriptionClient = new SubscriptionClient(
      `ws://localhost:${exports.serverPort}/subscription`,
      {
        reconnect: true,
      },
      WebSocket,
    );
    subscriptionClient.onConnected(function() {
      resolve(subscriptionClient);
    });
    subscriptionClient.onError(function(err) {
      reject(err);
    });
  });
};

const stubbedAuth = () => {
  const auth = new taskcluster.Auth({
    rootUrl: exports.rootUrl,
    fake: {
      createClient: async (clientId, input) => {
        return Promise.resolve({
          clientId,
          accessToken: 'fake-access-token',
          ...input,
        });
      },
      expandScopes({scopes}) {
        return {scopes};
      },
      resetAccessToken(clientId) {
        return Promise.resolve({ clientId, accessToken: taskcluster.slugid() });
      },
    },
  });

  return auth;
};

const stubbedClients = () => {
  const tasks = new Map();
  const roles = new Map();
  const workerPools = new Map();
  const options = {
    rootUrl: exports.rootUrl,
  };

  teardown(() => {
    tasks.clear();
    roles.clear();
    workerPools.clear();
  });

  exports.fakes = {
    makeWorkerPool: (workerPoolId, workerPool) => {
      workerPools.set(workerPoolId, {
        ...workerPool,
        workerPoolId,
      });
    },
    hasWorkerPool: workerPoolId => {
      return workerPools.has(workerPoolId);
    },
  };

  return () => ({
    github: new taskcluster.Github(options),
    hooks: new taskcluster.Hooks(options),
    index: new taskcluster.Index(options),
    purgeCache: new taskcluster.PurgeCache(options),
    secrets: new taskcluster.Secrets(options),
    queueEvents: new taskcluster.QueueEvents(options),
    notify: new taskcluster.Notify(options),
    workerManager: new taskcluster.WorkerManager({
      ...options,
      fake: {
        workerPool: async workerPoolId => workerPools.get(workerPoolId),
        listWorkerPools: async ({limit = 1000}) => ({workerPools: [...workerPools.values()].slice(0, limit)}),
        deleteWorkerPool: async workerPoolId => {
          if (!workerPools.has(workerPoolId)) {
            throw new Error(`No such worker pool ${workerPoolId}`);
          }
          workerPools.delete(workerPoolId);
        },
      },
    }),
    auth: new taskcluster.Auth({
      ...options,
      fake: {
        listRoles: async () => {
          let allRoles = [];
          for(let roleId of roles.keys()){
            allRoles.push(roles.get(roleId));
          }
          return Promise.resolve(allRoles);
        },
        listRoleIds: async () => {
          let roleIds = Array.from(roles.keys());
          return Promise.resolve({roleIds});
        },
        role: async (roleId) => {
          const role = roles.get(roleId);

          return role
            ? Promise.resolve(role)
            : Promise.reject(new Error('role not found'));
        },
        createRole: async (roleId, role) => {
          const newRole = {
            roleId: roleId,
            scopes: role.scopes,
            description: role.description,
            created: taskcluster.fromNowJSON(),
            lastModified: taskcluster.fromNowJSON(),
            expandedScopes: [],
          };
          roles.set(roleId, newRole);
          return Promise.resolve(newRole);
        },
        updateRole: async (roleId, role) => {
          if(!roles.has(roleId)){
            return Promise.reject('role not found');
          }
          const updatedRole = {
            roleId: roleId,
            scopes: role.scopes,
            description: role.description,
            created: taskcluster.fromNowJSON(),
            lastModified: taskcluster.fromNowJSON(),
            expandedScopes: [],
            ...role,
          };
          roles.set(roleId, updatedRole);
          return Promise.resolve(updatedRole);
        },
        deleteRole: async (roleId) => {
          if(!roles.has(roleId)){
            return Promise.reject('role not found');
          }
          roles.delete(roleId);
          return Promise.resolve(roleId);
        },
      },
    }),
    queue: new taskcluster.Queue({
      ...options,
      fake: {
        task: async (taskId) => {
          const taskDef = tasks.get(taskId);

          return taskDef
            ? Promise.resolve({
              taskId,
              ...taskDef,
            })
            : Promise.reject(new Error('task not found'));
        },
        createTask: async (taskId, taskDef) => {
          tasks.set(taskId, taskDef);
          const taskRun = {
            taskId,
            runId: 0,
            state: 'running',
            reasonCreated: 'scheduled',
            scheduled: taskcluster.fromNowJSON(),
          };
          const taskStatus = {
            taskId,
            provisionerId: taskDef.provisionerId,
            workerType: taskDef.workerType,
            schedulerId: taskDef.schedulerId,
            taskGroupId: taskDef.taskGroupId,
            deadline: taskDef.deadline,
            expires: taskDef.expires,
            retriesLeft: 1,
            state: 'running',
            runs: taskRun,
          };

          return Promise.resolve(taskStatus);
        },
        getArtifact: async (taskId, runId, name ) => {
          const artifact = {
            taskId: taskId,
            runId: runId,
            name: name,
          };
          return Promise.resolve(artifact);
        },
        listArtifacts: async (taskId, runId, options) => {
          const artifacts = ["1", "2", "3"].map(artifactSuffix => {
            return {
              taskId,
              runId,
              name: `artifact-${artifactSuffix}`,
            };
          });
          return Promise.resolve({artifacts});
        },
        listLatestArtifacts: async (taskId, options) => {
          const artifacts = ["1", "2", "3"].map(artifactSuffix => {
            return {
              taskId,
              name: `artifact-${artifactSuffix}`,
            };
          });
          return Promise.resolve({artifacts});
        },
        pendingTasks: async (provisionerId, workerType) => 0,
      },
    }),
  });
};

exports.resetTables = (mock, skipping) => {
  setup('reset tables', async function() {
    if (mock) {
      exports.db['web_server'].reset();
    } else {
      const sec = exports.secrets.get('db');
      await resetTables({ testDbUrl: sec.testDbUrl, tableNames: [
        'authorization_codes_table_entities',
        'access_token_table_entities',
        'session_storage_table_entities',
        'github_access_token_table_entities',
      ]});
    }
  });
};
