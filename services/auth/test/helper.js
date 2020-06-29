const assert = require('assert');
const debug = require('debug')('test-helper');
const _ = require('lodash');
const data = require('../src/data');
const builder = require('../src/api');
const taskcluster = require('taskcluster-client');
const load = require('../src/main');
const slugid = require('slugid');
const uuid = require('uuid');
const {APIBuilder} = require('taskcluster-lib-api');
const SchemaSet = require('taskcluster-lib-validate');
const staticScopes = require('../src/static-scopes.json');
const makeSentryManager = require('./../src/sentrymanager');
const {stickyLoader, Secrets, withEntity, withPulse, withMonitor, withDb, resetTables} = require('taskcluster-lib-testing');

exports.load = stickyLoader(load);

suiteSetup(async function() {
  process.env.GCP_ALLOWED_SERVICE_ACCOUNTS = JSON.stringify([
    'invalid@mozilla.com',
  ]);

  exports.load.inject('profile', 'test');
  exports.load.inject('process', 'test');
});

exports.rootUrl = `http://localhost:60552`;
exports.containerName = `auth-test-${uuid.v4()}`;
exports.rootAccessToken = '-test-access-token-that-is-at-least-22-chars-long-';

withMonitor(exports);

// set up the testing secrets
exports.secrets = new Secrets({
  secretName: 'project/taskcluster/testing/taskcluster-auth',
  secrets: {
    db: withDb.secret,
    azure: [
      {env: 'AZURE_ACCOUNT', cfg: 'azure.accountId', name: 'accountId'},
      {env: 'AZURE_ACCOUNT_KEY', cfg: 'azure.accessKey', name: 'accessKey'},
    ],
    aws: [
      {env: 'AWS_ACCESS_KEY_ID', name: 'awsAccessKeyId'},
      {env: 'AWS_SECRET_ACCESS_KEY', name: 'awsSecretAccessKey'},
      {env: 'TEST_BUCKET', name: 'testBucket'},
    ],
    gcp: [
      {env: 'GCP_CREDENTIALS_ALLOWED_PROJECTS', cfg: 'gcpCredentials.allowedProjects', name: 'allowedProjects', mock: {}},
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

    exports.load.save();

    // override app.staticClients based on the static scopes
    exports.load.cfg('app.staticClients', staticScopes.map(({clientId}) => ({
      clientId,
      accessToken: clientId === 'static/taskcluster/root' ? exports.rootAccessToken : 'must-be-at-least-22-characters',
      description: 'testing',
    })));

    // override cfg.app.azureAccounts based on cfg.azure
    exports.load.cfg('app.azureAccounts', {[exports.cfg.azure.accountId]: exports.cfg.azure.accessKey});
  });

  suiteTeardown(async function() {
    exports.load.restore();
  });
};

/**
 * Set helper.<Class> for each of the Azure entities used in the service
 */
exports.withEntities = (mock, skipping, {orderedTests} = {}) => {
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
  withEntity(mock, skipping, exports, 'Roles', data.Roles);
};

exports.withDb = (mock, skipping) => {
  withDb(mock, skipping, exports, 'auth');
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
exports.withRoles = (mock, skipping, options = {}) => {
  suiteSetup(async function() {
    if (skipping()) {
      return;
    }

    await exports.load('cfg');
    exports.load.cfg('app.rolesContainerName', exports.containerName);

    if (mock) {
      exports.Roles = new FakeRoles();
      exports.load.inject('Roles', exports.Roles);
    } else {
      exports.Roles = await exports.load('Roles');
    }
  });

  if (!options.orderedTests) {
    setup();
  }
  suiteTeardown();
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

    const cfg = await exports.load('cfg');

    const sentryClient = {
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

    exports.load.inject('sentryManager', makeSentryManager({
      ...cfg.app.sentry,
      sentryClient,
    }));
  });
};

exports.withPulse = (mock, skipping) => {
  withPulse({helper: exports, skipping, namespace: 'taskcluster-auth'});
};

const testServiceBuilder = new APIBuilder({
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
  category: 'Auth Service',
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

    // First set up the auth service
    exports.AuthClient = taskcluster.createClient(builder.reference());

    exports.setupScopes = (...scopes) => {
      exports.apiClient = new exports.AuthClient({
        credentials: {
          clientId: 'static/taskcluster/root',
          accessToken: exports.rootAccessToken,
        },
        rootUrl: exports.rootUrl,
        retries: 0,
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
      retries: 0,
      rootUrl: exports.rootUrl,
    });

    const testServiceName = 'authtest';
    const testServiceApi = await testServiceBuilder.build({
      monitor: (await exports.load('monitor')),
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

/**
 * Set up the `google` component with a fake if mocking, otherwise
 * using real credentials.
 */
exports.withGcp = (mock, skipping) => {
  let policy = {};

  const fakeGoogleApis = {
    iam: ({version, auth}) => {
      assert.equal(version, 'v1');

      const {client_email} = auth.testCredentials;
      const iamResource = `projects/-/serviceAccounts/${client_email}`;

      return {
        projects: {
          serviceAccounts: {
            getIamPolicy: async ({resource_}) => {
              if (resource_ !== iamResource) {
                // api method treats any error as "not found"
                throw new Error('Not found');
              }

              return {data: _.cloneDeep(policy)};
            },
            setIamPolicy: async ({resource, requestBody}) => {
              if (resource !== iamResource) {
                throw new Error('Not found');
              }

              assert.equal(requestBody.updateMask, 'bindings');
              policy = requestBody.policy;
            },
          },
        },
      };
    },

    iamcredentials: ({version, auth}) => {
      assert.equal(version, 'v1');

      const {client_email} = auth.testCredentials;

      return {
        projects: {
          serviceAccounts: {
            generateAccessToken: async ({name, scope, delegates, lifetime}) => {
              if (name === 'projects/-/serviceAccounts/invalid@mozilla.com') {
                throw new Error('Invalid account');
              }
              assert.equal(name, `projects/-/serviceAccounts/${client_email}`);
              assert.deepEqual(scope, ['https://www.googleapis.com/auth/cloud-platform']);
              assert.deepEqual(delegates, []);
              assert.equal(lifetime, '3600s');

              return {
                data: {
                  accessToken: 'sekrit',
                  expireTime: new Date(1978, 6, 15).toJSON(),
                },
              };
            },
          },
        },
      };
    },
  };

  suiteSetup('GCP credentials', async () => {
    if (skipping()) {
      return;
    }

    if (mock) {
      const credentials = {
        project_id: 'testproject',
        client_email: 'test_client@example.com',
      };
      const auth = {testCredentials: credentials};
      const allowedServiceAccounts = [
        credentials.client_email,
        'invalid@mozilla.com',
      ];

      exports.load.inject('gcp', {
        auth,
        googleapis: fakeGoogleApis,
        credentials,
        allowedServiceAccounts,
      });

      exports.gcpAccount = {
        email: 'test_client@example.com',
        project_id: credentials.project_id,
      };
    } else {
      const {credentials, allowedServiceAccounts} = await exports.load('gcp');
      exports.gcpAccount = {
        email: allowedServiceAccounts[0],
        project_id: credentials.project_id,
      };
    }
  });
};

exports.resetTables = (mock, skipping) => {
  setup('reset tables', async function() {
    if (mock) {
      exports.db['auth'].reset();
    } else {
      const sec = exports.secrets.get('db');
      await resetTables({ testDbUrl: sec.testDbUrl, tableNames: ['clients_entities', 'roles_entities'] });
    }
  });
};
