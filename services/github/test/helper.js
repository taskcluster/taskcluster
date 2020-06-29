const http = require('http');
const fs = require('fs');
const _ = require('lodash');
const builder = require('../src/api');
const taskcluster = require('taskcluster-client');
const load = require('../src/main');
const fakeGithubAuth = require('./github-auth');
const data = require('../src/data');
const {fakeauth, stickyLoader, Secrets, withEntity, withPulse, withMonitor, withDb, resetTables} = require('taskcluster-lib-testing');

exports.load = stickyLoader(load);

suiteSetup(async function() {
  exports.load.inject('profile', 'test');
  exports.load.inject('process', 'test');
});

withMonitor(exports);

// set up the testing secrets
exports.secrets = new Secrets({
  secrets: {
    db: withDb.secret,
  },
  load: exports.load,
});

// Build an http request from a json file with fields describing
// headers and a body
exports.jsonHttpRequest = function(jsonFile, options) {
  let defaultOptions = {
    hostname: 'localhost',
    port: 60415,
    path: '/api/github/v1/github',
    method: 'POST',
  };
  options = _.defaultsDeep(options, defaultOptions);
  let jsonData = JSON.parse(fs.readFileSync(jsonFile));
  options.headers = jsonData.headers;

  return new Promise(function(accept, reject) {
    try {
      let req = http.request(options, accept);
      req.write(JSON.stringify(jsonData.body));
      req.end();
    } catch (e) {
      reject(e);
    }
  });
};

/**
 * Set helper.<name> for each entity class
 */
exports.withEntities = (mock, skipping) => {
  withEntity(mock, skipping, exports, 'Builds', data.Builds, {orderedTests: true});
  withEntity(mock, skipping, exports, 'OwnersDirectory', data.OwnersDirectory, {orderedTests: true});
  withEntity(mock, skipping, exports, 'CheckRuns', data.CheckRuns, {orderedTests: true});
  withEntity(mock, skipping, exports, 'ChecksToTasks', data.ChecksToTasks, {orderedTests: true});
};

exports.withDb = (mock, skipping) => {
  withDb(mock, skipping, exports, 'github');
};

exports.withPulse = (mock, skipping) => {
  withPulse({helper: exports, skipping, namespace: 'taskcluster-github'});
};

/**
 * Set the `github` loader component to a fake version.
 * This is reset before each test.  Call this before withServer.
 */
exports.withFakeGithub = (mock, skipping) => {
  suiteSetup(function() {
    exports.load.inject('github', fakeGithubAuth());
  });

  suiteTeardown(function() {
    exports.load.remove('github');
  });

  setup(async function() {
    let fakeGithub = await exports.load('github');
    fakeGithub.resetStubs();
  });
};

/**
 * Set up an API server.  Call this after withEntities, so the server
 * uses the same entities classes.
 *
 * This also sets up helper.apiClient as a client of the service API.
 */
exports.withServer = (mock, skipping) => {
  let webServer;

  suiteSetup(async function() {
    if (skipping()) {
      return;
    }
    await exports.load('cfg');

    // even if we are using a "real" rootUrl for access to Azure, we use
    // a local rootUrl to test the API, including mocking auth on that
    // rootUrl.
    const rootUrl = 'http://localhost:60415';
    exports.load.cfg('taskcluster.rootUrl', rootUrl);
    exports.load.cfg('taskcluster.clientId', null);
    exports.load.cfg('taskcluster.accessToken', null);

    fakeauth.start({'test-client': ['*']}, {rootUrl});

    const GithubClient = taskcluster.createClient(builder.reference());

    exports.apiClient = new GithubClient({
      credentials: {clientId: 'test-client', accessToken: 'unused'},
      rootUrl,
      retries: 0,
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

exports.resetTables = (mock, skipping) => {
  setup('reset tables', async function() {
    if (mock) {
      exports.db['github'].reset();
    } else {
      const sec = exports.secrets.get('db');
      await resetTables({ testDbUrl: sec.testDbUrl, tableNames: [
        'taskcluster_github_builds_entities',
        'taskcluster_integration_owners_entities',
        'taskcluster_checks_to_tasks_entities',
        'taskcluster_check_runs_entities',
      ]});
    }
  });
};
