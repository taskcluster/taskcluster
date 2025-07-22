import { strict as assert } from 'assert';
import taskcluster from '@taskcluster/client';
import loadMain from '../../src/main.js';
import builder from '../../src/api.js';
import testing from '@taskcluster/lib-testing';
import { BACKEND_TYPES } from '../../src/backends/index.js';
import { MIDDLEWARE_TYPES } from '../../src/middleware/index.js';
import { TestBackend } from '../../src/backends/test.js';
import { TestMiddleware } from '../../src/middleware/test.js';
import { aws } from './aws.js';
import { google } from './google.js';

import { testBackend } from './backend-general.js';
import { testSimpleDownloadMethod } from './simple-download.js';
import { testGetUrlDownloadMethod } from './geturl-download.js';
import { testDataInlineUpload } from './data-inline-upload.js';
import { testPutUrlUpload } from './put-url-upload.js';

export const load = testing.stickyLoader(loadMain);

const helper = {
  load,
  testBackend,
  testSimpleDownloadMethod,
  testGetUrlDownloadMethod,
  testDataInlineUpload,
  testPutUrlUpload,
};

suiteSetup(async function() {
  load.inject('profile', 'test');
  load.inject('process', 'test');
});

testing.withMonitor(helper);

// set up the testing secrets
helper.secrets = new testing.Secrets({
  secretName: [
    'project/taskcluster/testing/taskcluster-object',
  ],
  secrets: {
    aws,
    google,
  },
  load,
});

const rootUrl = 'http://localhost:60401';
helper.rootUrl = rootUrl;
const testclients = {
  'test-client': ['*'],
  'test-server': ['*'],
};

/**
 * Set up the backend and middleware configuration, and
 * add the test types for both.
 *
 * Also adds:
 *  helper.setBackendConfig({ backends, backendMap }) - set and activate the backends config,
 *    or if no args then reset it to the default.
 */
helper.withBackends = (mock, skipping) => {
  let _backends;
  const defaultBackends = {
    testBackend: { backendType: 'test' },
  };
  const defaultBackendMap = [
    { backendId: 'testBackend', when: 'all' },
  ];

  suiteSetup('withBackends', async function() {
    if (skipping()) {
      return;
    }

    load.save();

    // add the 'test' backend type only for testing
    BACKEND_TYPES['test'] = TestBackend;

    await load('cfg');
    load.cfg('middleware', [
      { middlewareType: 'test' },
    ]);
    load.cfg('backends', defaultBackends);
    load.cfg('backendMap', defaultBackendMap);

    // load the backends so that we can use its sticky value later
    _backends = await load('backends');

    helper.setBackendConfig = async ({ backends, backendMap } = {}) => {
      const cfg = {
        ...(await load('cfg')),
        backends: backends || defaultBackends,
        backendMap: backendMap || defaultBackendMap,
      };
      await _backends._reconfig({ cfg });
    };
  });

  setup('withBackends', async function() {
    // reset to default
    await helper.setBackendConfig();
  });

  suiteTeardown('withBackends', async function() {
    if (skipping()) {
      return;
    }

    load.restore();
    delete BACKEND_TYPES['test'];
    delete helper.setBackendConfig;
    _backends = null;
  });
};

helper.withMiddleware = (mock, skipping, config) => {
  suiteSetup('withMiddleware', async function() {
    if (skipping()) {
      return;
    }

    // add the 'test' middleware type only for testing
    MIDDLEWARE_TYPES['test'] = TestMiddleware;

    await load('cfg');
    load.cfg('middleware', config || [
      { middlewareType: 'test' },
    ]);
  });

  suiteTeardown('withMiddleware', async function() {
    delete MIDDLEWARE_TYPES['test'];
  });
};

helper.withServer = (mock, skipping) => {
  let webServer;

  suiteSetup('withServer', async function() {
    if (skipping()) {
      return;
    }
    await load('cfg');
    load.cfg('server.port', 60401);
    load.cfg('server.env', 'development');
    load.cfg('server.forceSSL', false);
    load.cfg('server.trustProxy', true);

    // even if we are using a "real" rootUrl for access to Azure, we use
    // a local rootUrl to test the API, including mocking auth on that
    // rootUrl.
    load.cfg('taskcluster.rootUrl', rootUrl);
    load.cfg('taskcluster.clientId', null);
    load.cfg('taskcluster.accessToken', null);
    testing.fakeauth.start(testclients, { rootUrl });

    helper.ObjectClient = taskcluster.createClient(builder.reference());

    helper.apiClient = new helper.ObjectClient({
      credentials: {
        clientId: 'test-client',
        accessToken: 'doesnt-matter',
      },
      retries: 0,
      rootUrl,
    });

    webServer = await load('server');
  });

  suiteTeardown(async function() {
    if (skipping()) {
      return;
    }
    if (webServer) {
      await webServer.terminate();
      webServer = null;
    }
    testing.fakeauth.stop();
  });
};

helper.withDb = (mock, skipping) => {
  testing.withDb(mock, skipping, helper, 'object');
};

helper.resetTables = (mock, skipping) => {
  setup('reset tables', async function() {
    await testing.resetTables({
      tableNames: ['objects', 'object_hashes'],
    });
  });
};

let validator;

helper.assertSatisfiesSchema = async (data, id) => {
  if (!validator) {
    const schemaset = await load('schemaset');
    validator = await schemaset.validator('https://tc-testing.example.com');
  }

  const validator_error = validator(data, id);
  if (validator_error) {
    assert(false, "validation error:\n" + validator_error);
  }
};

/**
 * Generate a test object name
 */
let objectCounter = 0;

export const testObjectName = prefix =>
  // Use `objectCounter` to ensure every test uses a different name, and
  // use all of the printable, problematic characters from
  // https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-keys.html
  `${prefix}${objectCounter++}/test/&/$/@/=/;/:/+/,/?/\\/{}/^/%/[]/<>/#/~/|/\`/`;

helper.testObjectName = testObjectName;

export default helper;
