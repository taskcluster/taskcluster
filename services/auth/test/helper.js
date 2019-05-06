const debug = require('debug')('test-helper');
const _ = require('lodash');
const data = require('../src/data');
const builder = require('../src/api');
const taskcluster = require('taskcluster-client');
const load = require('../src/main');
const slugid = require('slugid');
const azure = require('fast-azure-storage');
const uuid = require('uuid');
const Builder = require('taskcluster-lib-api');
const SchemaSet = require('taskcluster-lib-validate');
const {stickyLoader, Secrets, withEntity, withPulse} = require('taskcluster-lib-testing');

exports.load = stickyLoader(load);

suiteSetup(async function() {
  exports.load.inject('profile', 'test');
  exports.load.inject('process', 'test');
});

exports.rootUrl = `http://localhost:60552`;

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
    gcp: [
      {env: 'GCP_CREDENTIALS', cfg: 'gcp.credentials', name: 'credentials'},
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
exports.withEntities = (mock, skipping, {orderedTests}={}) => {
  const cleanup = async () => {
    if (skipping()) {
      return;
    }

    await exports.Client.scan({}, {handler: async e => {
      // This is assumed to exist accross tests in many places
      if (e.clientId.startsWith('static/')) {
        return;
      }
      await e.remove();
    }});
  };

  withEntity(mock, skipping, exports, 'Client', data.Client, {
    noSasCredentials: true, // this *is* the auth service!
    orderedTests,
    cleanup,
  });
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

    await exports.load('cfg');
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

exports.withPulse = (mock, skipping) => {
  withPulse({helper: exports, skipping, namespace: 'taskcluster-auth'});
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
    await exports.load('cfg');

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

    // include this test API in the APIs served, alongside the normal auth service
    exports.load.inject('apis', [
      await exports.load('api'),
      testServiceApi,
    ]);
    webServer = await exports.load('server');
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
