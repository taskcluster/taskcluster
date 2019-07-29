const assert = require('assert');
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
const {stickyLoader, Secrets, withEntity, withPulse, withMonitor} = require('taskcluster-lib-testing');

exports.load = stickyLoader(load);

suiteSetup(async function() {
  process.env.GCP_ALLOWED_SERVICE_ACCOUNTS = JSON.stringify([
    'invalid@mozilla.com',
  ]);

  exports.load.inject('profile', 'test');
  exports.load.inject('process', 'test');
});

exports.rootUrl = `http://localhost:60552`;

withMonitor(exports);

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
      {env: 'GCP_ALLOWED_SERVICE_ACCOUNTS', cfg: 'gcp.allowedServiceAccounts', name: 'allowedServiceAccounts', mock: []},
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
    exports.rootAccessToken = '-test-access-token-that-is-at-least-22-chars-long-';

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
  const accountId = slugid.nice().replace(/_/g, '').toLowerCase();
  let auth, iam;
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
        name: 'testAccount',
        project_id: credentials.project_id,
      };
    } else {
      const {credentials, auth, googleapis, allowedServiceAccounts} = await exports.load('gcp');
      const projectId = credentials.project_id;

      iam = googleapis.iam({version: 'v1', auth});

      const res = await iam.projects.serviceAccounts.create({
        auth,
        name: `projects/${projectId}`,
        resource: {
          accountId,
          serviceAccount: {
            // This is a testing account and will be deleted by
            // the end of the tests. If the test crashes, these
            // accounts maybe left in IAM. Any account starting
            // with taskcluster-auth-test- can be safely removed.
            displayName: `taskcluster-auth-test-${accountId}`,
          },
        },
      });

      const serviceAccount = res.data.email;
      allowedServiceAccounts.push(serviceAccount);

      // to understand the {get/set}IamPolicy calls, look at
      // https://cloud.google.com/iam/docs/creating-short-lived-service-account-credentials
      //
      // Notice that might happen that between the getIamPolicy and setIamPolicy calls,
      // a third party might change the etag, making the call to setIamPolicy fail.
      const response = await iam.projects.serviceAccounts.getIamPolicy({
        // NOTE: the `-` here represents the projectId, and uses the projectId
        // from this.gcp.auth, which is why we verified those match above.
        resource_: `projects/-/serviceAccounts/${serviceAccount}`,
      });

      const data = response.data;
      if (data.bindings === undefined) {
        data.bindings = [];
      }

      let binding = data.bindings.find(b => b.role === 'roles/iam.serviceAccountTokenCreator');
      if (!binding) {
        binding = {
          role: 'roles/iam.serviceAccountTokenCreator',
          members: [],
        };

        data.bindings.push(binding);
      }

      const myServiceAccount = credentials.client_email;
      if (!binding.members.includes(`serviceAccount:${myServiceAccount}`)) {
        binding.members.push(`serviceAccount:${myServiceAccount}`);
        await iam.projects.serviceAccounts.setIamPolicy({
          // NOTE: the `-` here represents the projectId, and uses the projectId
          // from this.gcp.auth, which is why we verified those match above.
          resource: `projects/-/serviceAccounts/${serviceAccount}`,
          requestBody: {
            policy: data,
            updateMask: 'bindings',
          },
        });
      }

      exports.gcpAccount = {
        email: res.data.email,
        name: res.data.name,
        project_id: credentials.project_id,
      };
    }
  });

  suiteTeardown(async () => {
    if (skipping()) {
      return;
    }

    if (!mock) {
      await iam.projects.serviceAccounts.delete({name: exports.gcpAccount.name, auth});
    }
  });

};
