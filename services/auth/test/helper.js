import assert from 'assert';
import debugFactory from 'debug';
const debug = debugFactory('test-helper');
import _ from 'lodash';
import builder from '../src/api.js';
import taskcluster from 'taskcluster-client';
import { default as mainLoad } from '../src/main.js';
import slugid from 'slugid';
import fs from 'fs/promises';
import { v4 } from 'uuid';
import { APIBuilder } from 'taskcluster-lib-api';
import SchemaSet from 'taskcluster-lib-validate';
import makeSentryManager from './../src/sentrymanager.js';
import { syncStaticClients } from '../src/static-clients.js';
import { stickyLoader, Secrets, withMonitor } from 'taskcluster-lib-testing';
import * as libTesting from 'taskcluster-lib-testing';
import { URL } from 'url';
import path from 'path';

export const load = stickyLoader(mainLoad);

const __dirname = new URL('.', import.meta.url).pathname;

suiteSetup(async function() {
  process.env.GCP_ALLOWED_SERVICE_ACCOUNTS = JSON.stringify([
    'invalid@mozilla.com',
  ]);

  load.inject('profile', 'test');
  load.inject('process', 'test');
});

export const rootUrl = `http://localhost:60552`;
export const containerName = `auth-test-${v4()}`;
export const rootAccessToken = '-test-access-token-that-is-at-least-22-chars-long-';

const helper = { load, rootUrl, containerName, rootAccessToken };
export default helper;

withMonitor({ load });

// set up the testing secrets
helper.secrets = new Secrets({
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
  load,
});

helper.loadJson = async (filename) => JSON.parse(await fs.readFile(path.join(__dirname, filename), 'utf8'));

helper.withCfg = (mock, skipping) => {
  if (skipping()) {
    return;
  }
  suiteSetup(async function() {
    if (skipping()) {
      return;
    }

    helper.cfg = await load('cfg');

    load.save();

    const staticScopes = await helper.loadJson('../src/static-scopes.json');

    // override app.staticClients based on the static scopes
    load.cfg('app.staticClients', staticScopes.map(({ clientId }) => ({
      clientId,
      accessToken: clientId === 'static/taskcluster/root' ? helper.rootAccessToken : 'must-be-at-least-22-characters',
      description: 'testing',
    })));

    // override cfg.azureAccounts based on the azure secret, or mock it
    if (mock) {
      load.cfg('azureAccounts', undefined);
    } else {
      const sec = helper.secrets.get('azure');
      load.cfg('azureAccounts', { [sec.accountId]: sec.accessKey });
    }
  });

  suiteTeardown(async function() {
    if (skipping()) {
      return;
    }

    load.restore();
  });
};

helper.withDb = (mock, skipping) => {
  libTesting.withDb(mock, skipping, helper, 'auth');
};

/**
 * Setup a fake sentry
 */
helper.withSentry = (mock, skipping) => {
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

    load.inject('sentryManager', makeSentryManager({
      ...cfg.app.sentry,
      sentryClient,
    }));
  });
};

helper.withPulse = (mock, skipping) => {
  libTesting.withPulse({ helper, skipping, namespace: 'taskcluster-auth' });
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
helper.withServers = (mock, skipping) => {
  let webServer;

  suiteSetup(async function() {
    if (skipping()) {
      return;
    }
    debug('starting servers');
    await load('cfg');

    load.cfg('taskcluster.rootUrl', rootUrl);

    // First set up the auth service
    helper.AuthClient = taskcluster.createClient(builder.reference());

    helper.setupScopes = (...scopes) => {
      helper.apiClient = new helper.AuthClient({
        credentials: {
          clientId: 'static/taskcluster/root',
          accessToken: rootAccessToken,
        },
        rootUrl: rootUrl,
        retries: 0,
        authorizedScopes: scopes.length > 0 ? scopes : undefined,
      });
    };

    helper.setupScopes();

    // Now set up the test service
    helper.TestClient = taskcluster.createClient(testServiceBuilder.reference());

    helper.testClient = new helper.TestClient({
      credentials: {
        clientId: 'static/taskcluster/root',
        accessToken: rootAccessToken,
      },
      retries: 0,
      rootUrl: rootUrl,
    });

    const testServiceName = 'authtest';
    const testServiceApi = await testServiceBuilder.build({
      monitor: (await load('monitor')),
      rootUrl: rootUrl,
      schemaset: new SchemaSet({
        serviceName: testServiceName,
      }),
    });

    // include this test API in the APIs served, alongside the normal auth service
    load.inject('apis', [
      await load('api'),
      testServiceApi,
    ]);
    webServer = await load('server');
  });

  setup(() => {
    helper.setupScopes();
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
helper.withGcp = (mock, skipping) => {
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

      load.inject('gcp', {
        auth,
        googleapis: fakeGoogleApis,
        credentials,
        allowedServiceAccounts,
      });

      helper.gcpAccount = {
        email: 'test_client@example.com',
        project_id: credentials.project_id,
      };
    } else {
      // For testing, we expect a GCP service account defined with the "Service Account Token Creator"
      // role.  In CI, this is the "auth-granter" service account in the "taskcluster-tests" project.
      // It issues credentials for itself, so the allowedServiceAccounts must be (in order)
      // [<service account email>, invalid@mozilla.com].
      const { credentials, allowedServiceAccounts } = await load('gcp');

      helper.gcpAccount = {
        email: allowedServiceAccounts[0],
        project_id: credentials.project_id,
      };
    }
  });
};

helper.resetTables = (mock, skipping) => {
  setup('reset tables', async function() {
    await libTesting.resetTables({ tableNames: [
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
