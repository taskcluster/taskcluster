import assert from 'assert';
import debugFactory from 'debug';
const debug = debugFactory('test-helper');
import _ from 'lodash';
import builder from '../src/api';
import taskcluster from 'taskcluster-client';
import load from '../src/main';
import slugid from 'slugid';
import uuid from 'uuid';
import { APIBuilder } from 'taskcluster-lib-api';
import SchemaSet from 'taskcluster-lib-validate';
import staticScopes from '../src/static-scopes.json';
import makeSentryManager from './../src/sentrymanager.js';
import { syncStaticClients } from '../src/static-clients.js';
import { stickyLoader, Secrets, withPulse, withMonitor, withDb, resetTables } from 'taskcluster-lib-testing';

export const load = stickyLoader(load);

suiteSetup(async function() {
  process.env.GCP_ALLOWED_SERVICE_ACCOUNTS = JSON.stringify([
    'invalid@mozilla.com',
  ]);

  exports.load.inject('profile', 'test');
  exports.load.inject('process', 'test');
});

export const rootUrl = `http://localhost:60552`;
export const containerName = `auth-test-${uuid.v4()}`;
export const rootAccessToken = '-test-access-token-that-is-at-least-22-chars-long-';

withMonitor(exports);

// set up the testing secrets
export const secrets = new Secrets({
  secretName: [
    'project/taskcluster/testing/taskcluster-auth',
    'project/taskcluster/testing/azure',
  ],
  secrets: {
    azure: [
      { env: 'AZURE_ACCOUNT', name: 'accountId' },
      { env: 'AZURE_ACCOUNT_KEY', name: 'accessKey' },
    ],
    aws: [
      { env: 'AWS_ACCESS_KEY_ID', name: 'awsAccessKeyId' },
      { env: 'AWS_SECRET_ACCESS_KEY', name: 'awsSecretAccessKey' },
      { env: 'TEST_BUCKET', name: 'testBucket' },
    ],
    gcp: [
      { env: 'GCP_CREDENTIALS_ALLOWED_PROJECTS', cfg: 'gcpCredentials.allowedProjects', name: 'allowedProjects', mock: {} },
    ],
  },
  load: exports.load,
});

export const withCfg = (mock, skipping) => {
  if (skipping()) {
    return;
  }
  suiteSetup(async function() {
    if (skipping()) {
      return;
    }

    export const cfg = await load('cfg');

    exports.load.save();

    // override app.staticClients based on the static scopes
    exports.load.cfg('app.staticClients', staticScopes.map(({ clientId }) => ({
      clientId,
      accessToken: clientId === 'static/taskcluster/root' ? exports.rootAccessToken : 'must-be-at-least-22-characters',
      description: 'testing',
    })));

    // override cfg.azureAccounts based on the azure secret, or mock it
    if (mock) {
      exports.load.cfg('azureAccounts', undefined);
    } else {
      const sec = exports.secrets.get('azure');
      exports.load.cfg('azureAccounts', { [sec.accountId]: sec.accessKey });
    }
  });

  suiteTeardown(async function() {
    if (skipping()) {
      return;
    }

    exports.load.restore();
  });
};

export const withDb = (mock, skipping) => {
  withDb(mock, skipping, exports, 'auth');
};

/**
 * Setup a fake sentry
 */
export const withSentry = (mock, skipping) => {
  const sentryOrgs = {};
  suiteSetup(async function() {
    if (skipping()) {
      return;
    }

    const cfg = await load('cfg');

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

export const withPulse = (mock, skipping) => {
  withPulse({ helper: exports, skipping, namespace: 'taskcluster-auth' });
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
  scopes: 'myapi:resource',
  title: 'Get Resource',
  category: 'Auth Service',
  description: '...',
}, function(req, res) {
  res.status(200).json({
    message: 'Hello World',
  });
});

/**
 * Set up API servers.  Call this after withDb, so the server
 * uses the same entities classes.
 *
 * This is both the auth service and a testing service running behind
 * a reverse proxy.
 *
 * This also sets up helper.apiClient as a client of the service API.
 */
export const withServers = (mock, skipping) => {
  let webServer;

  suiteSetup(async function() {
    if (skipping()) {
      return;
    }
    debug('starting servers');
    await load('cfg');

    exports.load.cfg('taskcluster.rootUrl', exports.rootUrl);

    // First set up the auth service
    export const AuthClient = taskcluster.createClient(builder.reference());

    export const setupScopes = (...scopes) => {
      export const apiClient = new exports.AuthClient({
        credentials: {
          clientId: 'static/taskcluster/root',
          accessToken: exports.rootAccessToken,
        },
        rootUrl: exports.rootUrl,
        retries: 0,
        authorizedScopes: scopes.length > 0 ? scopes : undefined,
      });
    };

    setupScopes();

    // Now set up the test service
    export const TestClient = taskcluster.createClient(testServiceBuilder.reference());

    export const testClient = new exports.TestClient({
      credentials: {
        clientId: 'static/taskcluster/root',
        accessToken: exports.rootAccessToken,
      },
      retries: 0,
      rootUrl: exports.rootUrl,
    });

    const testServiceName = 'authtest';
    const testServiceApi = await testServiceBuilder.build({
      monitor: (await load('monitor')),
      rootUrl: exports.rootUrl,
      schemaset: new SchemaSet({
        serviceName: testServiceName,
      }),
    });

    // include this test API in the APIs served, alongside the normal auth service
    exports.load.inject('apis', [
      await load('api'),
      testServiceApi,
    ]);
    webServer = await load('server');
  });

  setup(() => {
    setupScopes();
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
  });
};

/**
 * Set up the `google` component with a fake if mocking, otherwise
 * using real credentials.
 */
export const withGcp = (mock, skipping) => {
  let policy = {};

  const fakeGoogleApis = {
    iam: ({ version, auth }) => {
      assert.equal(version, 'v1');

      const { client_email } = auth.testCredentials;
      const iamResource = `projects/-/serviceAccounts/${client_email}`;

      return {
        projects: {
          serviceAccounts: {
            getIamPolicy: async ({ resource_ }) => {
              if (resource_ !== iamResource) {
                // api method treats any error as "not found"
                throw new Error('Not found');
              }

              return { data: _.cloneDeep(policy) };
            },
            setIamPolicy: async ({ resource, requestBody }) => {
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

    iamcredentials: ({ version, auth }) => {
      assert.equal(version, 'v1');

      const { client_email } = auth.testCredentials;

      return {
        projects: {
          serviceAccounts: {
            generateAccessToken: async ({ name, scope, delegates, lifetime }) => {
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
      const auth = { testCredentials: credentials };
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

      export const gcpAccount = {
        email: 'test_client@example.com',
        project_id: credentials.project_id,
      };
    } else {
      // For testing, we expect a GCP service account defined with the "Service Account Token Creator"
      // role.  In CI, this is the "auth-granter" service account in the "taskcluster-tests" project.
      // It issues credentials for itself, so the allowedServiceAccounts must be (in order)
      // [<service account email>, invalid@mozilla.com].
      const { credentials, allowedServiceAccounts } = await load('gcp');

      export const gcpAccount = {
        email: allowedServiceAccounts[0],
        project_id: credentials.project_id,
      };
    }
  });
};

export const resetTables = (mock, skipping) => {
  setup('reset tables', async function() {
    await resetTables({ tableNames: [
      'roles',
      'clients',
    ] });

    // set up the static clients (which have already been overridden in withCfg)
    const cfg = await load('cfg');
    const db = await load('db');
    await syncStaticClients(db, cfg.app.staticClients || []);

    // ..and reload the resolver
    const resolver = await load('resolver');
    await resolver.reload();
  });
};
