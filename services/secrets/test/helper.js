import taskcluster from '@taskcluster/client';
import testing from '@taskcluster/lib-testing';
import loadMain from '../src/main.js';
import builder from '../src/api.js';
import { withDb } from '@taskcluster/lib-testing';

export const load = testing.stickyLoader(loadMain);
const helper = { load };
export default helper;

suiteSetup(async function() {
  load.inject('profile', 'test');
  load.inject('process', 'test');
});

testing.withMonitor(helper);

// set up the testing secrets
helper.secrets = new testing.Secrets({
  secrets: {
  },
  load,
});

helper.withDb = (mock, skipping) => {
  withDb(mock, skipping, helper, 'secrets');
};

// Some clients for the tests, with differents scopes.  These are turned
// into temporary credentials based on the main test credentials, so
// the clientIds listed here are purely internal to the tests.
let testClients = {
  'captain-write': ['secrets:set:captain:*'],
  'captain-read': ['secrets:get:captain:*'],
  'captain-read-write': ['secrets:set:captain:*', 'secrets:get:captain:*', 'secrets:list-secrets'],
  'captain-read-limited': ['secrets:get:captain:limited/*'],
  'none': [],
};

/**
 * Set up an API server.  Call this after withSecret, so the server
 * uses the same Secret class.
 *
 * This also sets up helper.client as an API client generator, using the
 * "captain" clients.
 */
helper.withServer = (mock, skipping) => {
  let webServer;

  suiteSetup(async function() {
    if (skipping()) {
      return;
    }
    await load('cfg');

    // even if we are using a "real" rootUrl for access to Azure, we use
    // a local rootUrl to test the API, including mocking auth on that
    // rootUrl.
    const rootUrl = 'http://localhost:60415';
    load.cfg('taskcluster.rootUrl', rootUrl);
    testing.fakeauth.start(testClients, { rootUrl });

    helper.client = async clientId => {
      const SecretsClient = taskcluster.createClient(builder.reference());

      return new SecretsClient({
        credentials: { clientId, accessToken: 'unused' },
        rootUrl,
        retries: 0,
      });
    };

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
