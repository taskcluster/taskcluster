import assert from 'assert';
import load from '../src/main.js';
import taskcluster from '@taskcluster/client';
import { Secrets, stickyLoader, withMonitor, withPulse, withDb, resetTables } from '@taskcluster/lib-testing';
import sinon from 'sinon';
import GithubClient from '../src/login/clients/GithubClient.js';
import libUrls from 'taskcluster-lib-urls';
import request from 'superagent';
import merge from 'deepmerge';
import PulseEngine from '../src/PulseEngine/index.js';
import { WebSocketLink } from 'apollo-link-ws';
import WebSocket from 'ws';
import { SubscriptionClient } from 'subscriptions-transport-ws';
import { ApolloClient, InMemoryCache, HttpLink } from '@apollo/client/core/index.js';
import got from 'got';
import path from 'path';
import fs from 'fs/promises';

const helper = {};
export default helper;
helper.load = stickyLoader(load);

suiteSetup(async function() {
  helper.load.inject('profile', 'test');
  helper.load.inject('process', 'test');
});

withMonitor(helper);

/** @param {string} errorCode */
helper.expectMonitorError = async (errorCode) => {
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
  secrets: {
  },
  load: helper.load,
});

helper.withDb = (mock, skipping) => {
  withDb(mock, skipping, helper, 'web_server');
};

helper.withPulse = (helper, skipping) => {
  withPulse({ helper, skipping, namespace: 'taskcluster-web-server' });
};

helper.withMockedEventIterator = () => {
  let PulseEngineCopy = Object.assign({}, PulseEngine);

  PulseEngineCopy.NextAsyncIterator = null;
  helper.setNextAsyncIterator = (asyncIterator) => {
    PulseEngineCopy.NextAsyncIterator = asyncIterator;
  };

  PulseEngineCopy.eventIterator = (eventName, subscriptions) => {
    if (!PulseEngineCopy.NextAsyncIterator) {
      throw new Error(`No async iterator to return. Set one up with SetNextAsyncIterator`);
    }
    return PulseEngineCopy.NextAsyncIterator;
  };

  helper.load.inject('pulseEngine', PulseEngineCopy);

  suiteTeardown(() => {
    helper.load.remove('pulseEngine');
  });
};

helper.withFakeAuth = (mock, skipping) => {
  suiteSetup('withFakeAuth', function() {
    if (skipping()) {
      return;
    }

    helper.load.inject('auth', stubbedAuth());
  });
};

helper.withFakeAuthFactory = (mock, skipping) => {
  suiteSetup('withFakeAuthFactory', function() {
    if (skipping()) {
      return;
    }

    helper.load.inject('authFactory', stubbedAuthFactory());
  });

  suiteTeardown(function() {
    helper.load.remove('authFactory');
  });
};

helper.withClients = (mock, skipping) => {
  suiteSetup('withClients', async function() {
    if (skipping()) {
      return;
    }

    const clients = stubbedClients();

    helper.load.inject('clients', clients);
    helper.clients = clients;
  });

  suiteTeardown(function () {
    helper.load.remove('clients');
  });
};

helper.withServer = (mock, skipping) => {
  let webServer;

  // return a signed-in Superagent agent
  const signedInAgent = async () => {
    const agent = request.agent();
    await agent.get(`http://127.0.0.1:${helper.serverPort}/login/test`);
    return agent;
  };

  suiteSetup('withServer', async function() {
    if (skipping()) {
      return;
    }
    const cfg = await helper.load('cfg');

    webServer = await helper.load('httpServer');
    await new Promise((resolve, reject) => {
      webServer.once('error', reject);
      webServer.listen(cfg.server.port, function() {
        resolve();
      });
    });

    helper.serverPort = cfg.server.port;
    helper.signedInAgent = signedInAgent;

    helper.load.cfg('app.publicUrl', `http://127.0.0.1:${helper.serverPort}`);
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

helper.githubFixtures = {
  users: {
    'octocat': 10,
    'taskcluster': 20,
    'a/c': 30,
  },
  teams: {
    'octocat': [
      { slug: 'team-1', organization: { login: 'taskcluster' } },
      { slug: 'team-2', organization: { login: 'neutrinojs' } },
    ],
    'taskcluster': [
      { slug: 'team-3', organization: { login: 'taskcluster' } },
      { slug: 'team-1', organization: { login: 'neutrinojs' } },
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

helper.makeTaskDefinition = (options = {}) => merge({
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

helper.getHttpClient = (clientOptions = {}) => {
  const gotFetch = async (url, options) => {
    // Map Fetch API options to Got options
    const gotOptions = {
      method: options.method || 'GET',
      headers: options.headers,
      body: options.body,
      responseType: 'json',
      throwHttpErrors: false,
    };

    // Got uses json option for sending JSON, while Fetch API uses body
    if (options.headers && options.headers['Content-Type'] === 'application/json' && options.body) {
      gotOptions.json = JSON.parse(options.body);
      delete gotOptions.body;
    }

    // Make the request
    const response = await got(url, gotOptions);

    // Mimic the Fetch API response
    const fetchResponse = {
      ok: response.statusCode >= 200 && response.statusCode < 300,
      status: response.statusCode,
      statusText: response.statusMessage,
      json: async () => response.body,
      text: async () => JSON.stringify(response.body, null, 2),
      headers: new Headers(response.headers),
    };

    // useful to debug real errors before HttpLink throws obfuscated errors
    if (!clientOptions.suppressErrors && (!fetchResponse.ok || response.body?.errors)) {
      console.error(`Error from ${url}: \n${await fetchResponse.text()}`);
    }

    return fetchResponse;
  };

  const cache = new InMemoryCache();
  const httpLink = new HttpLink({
    uri: `http://localhost:${helper.serverPort}/graphql`,
    fetch: gotFetch,
  });

  return new ApolloClient({ cache, link: httpLink });
};

helper.getWebsocketClient = (subscriptionClient) => {
  const cache = new InMemoryCache();
  const link = new WebSocketLink(subscriptionClient);

  return new ApolloClient({ cache, link });
};

// If a subscription client is created for a test, it also needs to be closed.
// Otherwise, the tests will just hang and timeout
helper.createSubscriptionClient = async () => {

  const credentials = {
    clientId: 'testing',
    accessToken: 'testing',
  };

  return new Promise(function(resolve, reject) {
    const subscriptionClient = new SubscriptionClient(
      `ws://localhost:${helper.serverPort}/subscription`,
      {
        reconnect: true,
        connectionParams: () => {
          return {
            Authorization: `Bearer ${btoa(JSON.stringify(credentials))}`,
          };
        },
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
  return ({ credentials }) => new taskcluster.Auth({
    rootUrl: helper.rootUrl,
    fake: {
      currentScopes: async () => ({ scopes: ['web:read-pulse'] }),
    },
  });
};

const stubbedClients = () => {
  const tasks = new Map();
  const roles = new Map();
  const workerPools = new Map();
  const options = {
    rootUrl: helper.rootUrl,
    // credentials are required to generate signed URLs
    credentials: {
      clientId: 'testing',
      accessToken: 'testing',
    },
  };

  teardown(() => {
    tasks.clear();
    roles.clear();
    workerPools.clear();
  });

  helper.fakes = {
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
    hooks: new taskcluster.Hooks({
      ...options,
      fake: {
        createHook: async (hookGroupId, hookId, payload) => {
          return Promise.resolve({
            hookGroupId,
            hookId,
            payload,
          });
        },
        hook: async (hookGroupId, hookId) => {
          return Promise.resolve({
            hookGroupId,
            hookId,
          });
        },
        listLastFires: async (hookGroupId, hookId, filter) => {
          const taskStates = ['unscheduled', 'pending', 'running', 'completed', 'failed', 'exception', 'unknown'];
          const fireResults = ['success', 'error', 'no-fire'];
          const lastFires = taskStates.map((taskState, i) => ({
            hookGroupId,
            hookId,
            taskId: taskcluster.slugid(),
            taskState,
            result: fireResults[i % fireResults.length],
            error: '',
          }));
          return Promise.resolve({ lastFires });
        },
      },
    }),
    index: new taskcluster.Index(options),
    purgeCache: new taskcluster.PurgeCache(options),
    secrets: new taskcluster.Secrets(options),
    queueEvents: new taskcluster.QueueEvents(options),
    notify: new taskcluster.Notify(options),
    workerManager: new taskcluster.WorkerManager({
      ...options,
      fake: {
        workerPool: async workerPoolId => workerPools.get(workerPoolId),
        listWorkerPools: async ({ limit = 1000 }) => ({ workerPools: [...workerPools.values()].slice(0, limit) }),
        listWorkerPoolsStats: async ({ limit = 1000 }) => ({
          workerPoolsStats: [...workerPools.values()].slice(0, limit) }),
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
          for (let roleId of roles.keys()) {
            allRoles.push(roles.get(roleId));
          }
          return Promise.resolve(allRoles);
        },
        listRoleIds: async () => {
          let roleIds = Array.from(roles.keys());
          return Promise.resolve({ roleIds });
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
          if (!roles.has(roleId)) {
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
          if (!roles.has(roleId)) {
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
        getArtifact: async (taskId, runId, name) => {
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
          return Promise.resolve({ artifacts });
        },
        listLatestArtifacts: async (taskId, options) => {
          const artifacts = ["1", "2", "3"].map(artifactSuffix => {
            return {
              taskId,
              name: `artifact-${artifactSuffix}`,
            };
          });
          return Promise.resolve({ artifacts });
        },
        pendingTasks: async (taskQueueId) => 0,
      },
    }),
  });
};

helper.resetTables = (mock, skipping) => {
  setup('reset tables', async function() {
    await resetTables({ tableNames: [
      'authorization_codes',
      'access_tokens',
      'sessions',
      'github_access_tokens',
    ] });
  });
};

const __dirname = new URL('.', import.meta.url).pathname;
const fixturesCache = new Map();
helper.loadFixture = async (name) => {
  if (!fixturesCache.has(name)) {
    fixturesCache.set(
      name,
      await fs.readFile(path.resolve(__dirname, 'fixtures', name), 'utf8'),
    );
  }
  return fixturesCache.get(name);
};
