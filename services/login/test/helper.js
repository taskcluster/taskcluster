const taskcluster = require('taskcluster-client');
const {fakeauth, stickyLoader} = require('taskcluster-lib-testing');
const builder = require('../src/v1');
const load = require('../src/main');
const _ = require('lodash');

const helper = module.exports = {};
helper.load = stickyLoader(load);

// Call this in suites or tests that make API calls, etc; it will set up
// what's required to respond to those calls.
helper.setup = function(options = {}) {
  let webServer = null;

  // Setup before tests
  suiteSetup(async () => {
    helper.load.inject('profile', 'test');
    helper.load.inject('process', 'test-helper');
    const cfg = await helper.load('cfg');
    helper.rootUrl = `http://localhost:${cfg.server.port}`;
    helper.load.cfg('taskcluster.rootUrl', helper.rootUrl);
    webServer = await helper.load('server');

    fakeauth.start({
      'test-client': ['*'],
    }, {rootUrl: helper.rootUrl});

    // Create client for working with API
    const reference = builder.reference();
    helper.Login = taskcluster.createClient(reference);
    // Utility to create an Login instance with limited scopes
    helper.scopes = (...scopes) => {
      helper.login = new helper.Login({
        // Ensure that we use global agent, to avoid problems with keepAlive
        // preventing tests from exiting
        agent:            require('http').globalAgent,
        credentials: {
          clientId:       'test-client',
          accessToken:    'none',
        },
        authorizedScopes: scopes.length > 0 ? scopes : undefined,
        rootUrl: helper.rootUrl,
      });
    };
  });

  // Setup before each test
  setup(async () => {
    // Setup client with all scopes
    helper.scopes();
  });

  // Cleanup after tests
  suiteTeardown(async () => {
    // Kill webServer
    if (webServer) {
      await webServer.terminate();
      webServer = null;
    }
    fakeauth.stop();
  });
};
