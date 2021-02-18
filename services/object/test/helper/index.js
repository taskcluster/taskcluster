const assert = require('assert').strict;
const taskcluster = require('taskcluster-client');
const { fakeauth, stickyLoader, Secrets, withMonitor, resetTables } = require('taskcluster-lib-testing');
const load = require('../../src/main');
const builder = require('../../src/api.js');
const { withDb } = require('taskcluster-lib-testing');
const { BACKEND_TYPES } = require('../../src/backends');
const { MIDDLEWARE_TYPES } = require('../../src/middleware');
const { TestBackend } = require('../../src/backends/test');
const { TestMiddleware } = require('../../src/middleware/test');
const aws = require('./aws');
const google = require('./google');

Object.assign(exports, require('./simple-download'));
Object.assign(exports, require('./data-inline-upload'));
Object.assign(exports, require('./put-url-upload'));

exports.load = stickyLoader(load);

suiteSetup(async function() {
  exports.load.inject('profile', 'test');
  exports.load.inject('process', 'test');
});

withMonitor(exports);

// set up the testing secrets
exports.secrets = new Secrets({
  secretName: [
    'project/taskcluster/testing/taskcluster-object',
  ],
  secrets: {
    aws: aws.secret,
    google: google.secret,
  },
  load: exports.load,
});

exports.rootUrl = 'http://localhost:60401';
const testclients = {
  'test-client': ['*'],
  'test-server': ['*'],
};

/**
 * Set up the backend and middleware configuration, and
 * add the test types for both.
 */
exports.withBackends = (mock, skipping) => {
  suiteSetup('withBackends', async function() {
    if (skipping()) {
      return;
    }

    // add the 'test' backend type only for testing
    BACKEND_TYPES['test'] = TestBackend;

    await exports.load('cfg');
    exports.load.cfg('middleware', [
      { middlewareType: 'test' },
    ]);
    exports.load.cfg('backends', {
      testBackend: { backendType: 'test' },
    });
    exports.load.cfg('backendMap', [
      // not anchored, so can appear anywhere in the name
      { backendId: 'testBackend', when: 'all' },
    ]);
  });

  suiteTeardown('withBackends', async function() {
    delete BACKEND_TYPES['test'];
  });
};

exports.withMiddleware = (mock, skipping, config) => {
  suiteSetup('withMiddleware', async function() {
    if (skipping()) {
      return;
    }

    // add the 'test' middleware type only for testing
    MIDDLEWARE_TYPES['test'] = TestMiddleware;

    await exports.load('cfg');
    exports.load.cfg('middleware', config || [
      { middlewareType: 'test' },
    ]);
  });

  suiteTeardown('withMiddleware', async function() {
    delete MIDDLEWARE_TYPES['test'];
  });
};

exports.withServer = (mock, skipping) => {
  let webServer;

  suiteSetup('withServer', async function() {
    if (skipping()) {
      return;
    }
    await exports.load('cfg');
    exports.load.cfg('server.port', 60401);
    exports.load.cfg('server.env', 'development');
    exports.load.cfg('server.forceSSL', false);
    exports.load.cfg('server.trustProxy', true);

    // even if we are using a "real" rootUrl for access to Azure, we use
    // a local rootUrl to test the API, including mocking auth on that
    // rootUrl.
    exports.load.cfg('taskcluster.rootUrl', exports.rootUrl);
    exports.load.cfg('taskcluster.clientId', null);
    exports.load.cfg('taskcluster.accessToken', null);
    fakeauth.start(testclients, { rootUrl: exports.rootUrl });

    exports.ObjectClient = taskcluster.createClient(builder.reference());

    exports.apiClient = new exports.ObjectClient({
      credentials: {
        clientId: 'test-client',
        accessToken: 'doesnt-matter',
      },
      retries: 0,
      rootUrl: exports.rootUrl,
    });

    webServer = await exports.load('server');
  });

  suiteTeardown(async function() {
    if (skipping()) {
      return;
    }
    if (webServer) {
      await webServer.terminate();
      webServer = null;
    }
    fakeauth.stop();
  });
};

exports.withDb = (mock, skipping) => {
  withDb(mock, skipping, exports, 'object');
};

exports.resetTables = (mock, skipping) => {
  setup('reset tables', async function() {
    await resetTables({
      tableNames: ['objects'],
    });
  });
};

let validator;
exports.assertSatisfiesSchema = async (data, id) => {
  if (!validator) {
    const schemaset = await exports.load('schemaset');
    validator = await schemaset.validator('https://tc-testing.example.com');
  }

  const validator_error = validator(data, id);
  if (validator_error) {
    assert(false, "validation error:\n" + validator_error);
  }
};
