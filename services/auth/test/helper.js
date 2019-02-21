const debug = require('debug')('test-helper');
const assert = require('assert');
const http = require('http');
const httpProxy = require('http-proxy');
const path = require('path');
const _ = require('lodash');
const data = require('../src/data');
const builder = require('../src/v1');
const taskcluster = require('taskcluster-client');
const mocha = require('mocha');
const load = require('../src/main');
const exchanges = require('../src/exchanges');
const slugid = require('slugid');
const Config = require('typed-env-config');
const azure = require('fast-azure-storage');
const temporary = require('temporary');
const mockAwsS3 = require('mock-aws-s3');
const containers = require('../src/containers');
const uuid = require('uuid');
const Builder = require('taskcluster-lib-api');
const SchemaSet = require('taskcluster-lib-validate');
const App = require('taskcluster-lib-app');
const libUrls = require('taskcluster-lib-urls');
const {fakeauth, stickyLoader, Secrets} = require('taskcluster-lib-testing');
const {FakeClient} = require('taskcluster-lib-pulse');

exports.suiteName = path.basename;

exports.load = stickyLoader(load);

suiteSetup(async function() {
  exports.load.inject('profile', 'test');
  exports.load.inject('process', 'test');
});

const PROXY_PORT = 60551;
exports.rootUrl = `http://localhost:${PROXY_PORT}`;

// set up the testing secrets
exports.secrets = new Secrets({
  secretName: 'project/taskcluster/testing/taskcluster-auth',
  secrets: {
    app: [
      {env: 'AZURE_ACCOUNTS', cfg: 'app.azureAccounts', mock: {fakeaccount: 'key'}},
    ],
    azure: [
      {env: 'AZURE_ACCOUNT', cfg: 'azure.accountId', name: 'accountId'},
      {env: 'AZURE_ACCOUNT_KEY', cfg: 'azure.accessKey', name: 'accountKey'},
    ],
    aws: [
      {env: 'AWS_ACCESS_KEY_ID', cfg: 'aws.accessKeyId'},
      {env: 'AWS_SECRET_ACCESS_KEY', cfg: 'aws.secretAccessKey'},
    ],
    taskcluster: [
      {env: 'TASKCLUSTER_ROOT_URL', cfg: 'taskcluster.rootUrl', name: 'rootUrl', mock: exports.rootUrl},
    ],
    sentry: [
      {env: 'SENTRY_AUTH_TOKEN', cfg: 'sentry.authToken'},
      {env: 'SENTRY_HOSTNAME', cfg: 'sentry.hostname'},
    ],
  },
  load: exports.load,
});

exports.withCfg = (mock, skipping) => {
  if (skipping()) {
    return;
  }
  suiteSetup(async function() {
    exports.cfg = await exports.load('cfg');
  });
};

/**
 * Set helper.<Class> for each of the Azure entities used in the service
 */
exports.withEntities = (mock, skipping, options={}) => {
  const tables = [
    {name: 'Client'},
  ];

  suiteSetup(async function() {
    if (skipping()) {
      return;
    }

    const cfg = await exports.load('cfg');
    exports.testaccount = _.keys(cfg.app.azureAccounts)[0];
    exports.clientTableName = `TestClients${Date.now()}v${slugid.nice().replace(/[_-]/g, '')}`;
    exports.load.cfg('app.clientTableName', exports.clientTableName);

    if (mock) {
      await Promise.all(tables.map(async tbl => {
        exports.load.inject(tbl.name, data[tbl.className || tbl.name].setup({
          tableName: tbl.name,
          credentials: 'inMemory',
          context: tbl.context ? await tbl.context() : undefined,
          cryptoKey: cfg.azure.cryptoKey,
          signingKey: cfg.azure.signingKey,
        }));
      }));
    }

    await Promise.all(tables.map(async tbl => {
      exports[tbl.name] = await exports.load(tbl.name);
      await exports[tbl.name].ensureTable();
    }));
  });

  const cleanup = async () => {
    if (skipping()) {
      return;
    }

    await Promise.all(tables.map(async tbl => {
      await exports[tbl.name].scan({}, {handler: async e => {
        // This is assumed to exist accross tests in many places
        if (tbl.name === 'Client' && e.clientId.startsWith('static/')) {
          return;
        }
        await e.remove();
      }});
    }));
  };
  if (!options.orderedTests) {
    setup(cleanup);
  }
  suiteTeardown(cleanup);
};

// fake "Roles" container
class FakeRoles {
  constructor() {
    this.roles = [];
  }

  async get() {
    return this.roles;
  }

  async modify(modifier) {
    await modifier(this.roles);
  }
}

/**
 * Setup the Roles blob
 */
exports.withRoles = (mock, skipping, options={}) => {
  suiteSetup(async function() {
    if (skipping()) {
      return;
    }

    const cfg = await exports.load('cfg');
    exports.containerName = `auth-test-${uuid.v4()}`;
    exports.load.cfg('app.rolesContainerName', exports.containerName);

    if (mock) {
      exports.Roles = new FakeRoles();
      exports.load.inject('Roles', exports.Roles);
    } else {
      exports.Roles = await exports.load('Roles');
    }
  });

  const cleanup = async () => {
    if (skipping()) {
      return;
    }
    if (mock) {
      exports.Roles.roles = [];
    } else {
      const cfg = await exports.load('cfg');
      const blobService = new azure.Blob({
        accountId: cfg.azure.accountId,
        accountKey: cfg.azure.accountKey,
      });
      try {
        await blobService.deleteContainer(exports.containerName);
      } catch (e) {
        if (e.code !== 'ResourceNotFound') {
          throw e;
        }
        // already deleted, so nothing to do
        // NOTE: really, this doesn't work -- the container doesn't register as existing
        // before the tests are complete, so we "leak" containers despite this effort to
        // clean them up.
      }
    }
  };
  if (!options.orderedTests) {
    setup(cleanup);
  }
  suiteTeardown(cleanup);
};

/**
 * Setup a fake sentry
 */
exports.withSentry = (mock, skipping) => {
  const sentryOrgs = {};
  suiteSetup(async function() {
    if (skipping()) {
      return;
    }

    const sentryFake = {
      organizations: {
        projects: org => Object.values(sentryOrgs[org]),
      },
      teams: {
        createProject: (org, team, info) => {
          if (!sentryOrgs[org]) {
            sentryOrgs[org] = {};
          }
          sentryOrgs[org][info.slug] = {
            slug: info.slug,
            keys: {},
          };
        },
      },
      projects: {
        keys: (org, project) => Object.values(sentryOrgs[org][project].keys),
        createKey: (org, project, extra) => {
          const key = {
            id: slugid.v4(),
            dsn: {
              secret: 'https://foobar.com/',
              public: 'https://bazbing.net/',
            },
            label: extra.name,
          };
          sentryOrgs[org][project].keys[key.id] = key;
          return key;
        },
        deleteKey: (org, project, key) => {
          delete sentryOrgs[org][project].keys[key];
        },
      },
    };

    if (mock) {
      exports.load.inject('sentryClient', sentryFake);
    }
  });
};

/**
 * Set up tc-lib-pulse in fake mode, with a publisher at at helper.publisher.
 * Messages are stored in helper.messages.  The `helper.checkNextMessage`
 * function allows asserting the content of the next message, and
 * `helper.checkNoNextMessage` is an assertion that no such message is in the
 * queue.
 */
exports.withPulse = (mock, skipping) => {
  suiteSetup(async function() {
    if (skipping()) {
      return;
    }

    exports.load.inject('pulseClient', new FakeClient());

    await exports.load('cfg');
    exports.load.cfg('taskcluster.rootUrl', exports.rootUrl);
    exports.publisher = await exports.load('publisher');

    exports.checkNextMessage = (exchange, check) => {
      for (let i = 0; i < exports.messages.length; i++) {
        const message = exports.messages[i];
        // skip messages for other exchanges; this allows us to ignore
        // ordering of messages that occur in indeterminate order
        if (!message.exchange.endsWith(exchange)) {
          continue;
        }
        check && check(message);
        exports.messages.splice(i, 1); // delete message from queue
        return;
      }
      throw new Error(`No messages found on exchange ${exchange}; ` +
        `message exchanges: ${JSON.stringify(exports.messages.map(m => m.exchange))}`);
    };

    exports.checkNoNextMessage = exchange => {
      assert(!exports.messages.some(m => m.exchange.endsWith(exchange)));
    };
  });

  const recordMessage = msg => exports.messages.push(msg);
  setup(function() {
    exports.messages = [];
    exports.publisher.on('message', recordMessage);
  });

  teardown(function() {
    exports.publisher.removeListener('message', recordMessage);
  });
};

const testServiceBuilder = new Builder({
  title: 'Test API Server',
  description: 'API server for testing',
  serviceName: 'authtest',
  apiVersion: 'v1',
});

testServiceBuilder.declare({
  method: 'get',
  route: '/resource',
  name: 'resource',
  scopes: {AllOf: ['myapi:resource']},
  title: 'Get Resource',
  description: '...',
}, function(req, res) {
  res.status(200).json({
    message: 'Hello World',
  });
});

/**
 * Set up API servers.  Call this after withEntities, so the server
 * uses the same entities classes.
 *
 * This is both the auth service and a testing service running behind
 * a reverse proxy.
 *
 * This also sets up helper.apiClient as a client of the service API.
 */
exports.withServers = (mock, skipping) => {

  let webServer;
  let testServer;
  let proxier;

  suiteSetup(async function() {
    if (skipping()) {
      return;
    }
    debug('starting servers');
    const cfg = await exports.load('cfg');

    exports.load.cfg('taskcluster.rootUrl', exports.rootUrl);
    exports.rootAccessToken = '-test-access-token-';

    // First set up the auth service
    exports.AuthClient = taskcluster.createClient(builder.reference());

    exports.setupScopes = (...scopes) => {
      exports.apiClient = new exports.AuthClient({
        credentials: {
          clientId: 'static/taskcluster/root',
          accessToken: exports.rootAccessToken,
        },
        rootUrl: exports.rootUrl,
        authorizedScopes: scopes.length > 0 ? scopes : undefined,
      });
    };
    exports.setupScopes();

    webServer = await exports.load('server');

    // Now set up the test service
    exports.TestClient = taskcluster.createClient(testServiceBuilder.reference());
    exports.testClient = new exports.TestClient({
      credentials: {
        clientId: 'static/taskcluster/root',
        accessToken: exports.rootAccessToken,
      },
      rootUrl: exports.rootUrl,
    });

    const testServiceName = 'authtest';
    const testServiceApi = await testServiceBuilder.build({
      monitor: (await exports.load('monitor')).monitor(),
      rootUrl: exports.rootUrl,
      schemaset: new SchemaSet({
        serviceName: testServiceName,
      }),
    });

    testServer = await App({
      port: 60553,
      env: 'development',
      forceSSL: false,
      trustProxy: false,
      rootDocsLink: false,
      apis: [testServiceApi],
    });

    // Finally, we set up a proxy that runs on rootUrl
    // and sends requests to either of the services based on path.

    const proxy = httpProxy.createProxyServer({});
    proxier = http.createServer(function(req, res) {
      if (req.url.startsWith('/api/auth/')) {
        proxy.web(req, res, {target: 'http://localhost:60552'});
      } else if (req.url.startsWith(`/api/${testServiceName}/`)) {
        proxy.web(req, res, {target: 'http://localhost:60553'});
      } else {
        throw new Error(`Unknown service request: ${req.url}`);
      }
    });
    proxier.listen(PROXY_PORT);

  });

  setup(() => {
    exports.setupScopes();
  });

  suiteTeardown(async function() {
    if (skipping()) {
      return;
    }
    debug('shutting down servers');
    if (webServer) {
      await webServer.terminate();
      webServer = null;
    }
    if (testServer) {
      await testServer.terminate();
      testServer = null;
    }
    if (proxier) {
      proxier.close();
      proxier = null;
    }
  });
};
