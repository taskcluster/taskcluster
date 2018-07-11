const http = require('http');
const fs = require('fs');
const _ = require('lodash');
const slugid = require('slugid');
const builder = require('../src/api');
const Intree = require('../src/intree');
const taskcluster = require('taskcluster-client');
const load = require('../src/main');
const fakeGithubAuth = require('./github-auth');
const data = require('../src/data');
const libUrls = require('taskcluster-lib-urls');
const {fakeauth, stickyLoader, Secrets} = require('taskcluster-lib-testing');

exports.load = stickyLoader(load);

suiteSetup(async function() {
  exports.load.inject('profile', 'test');
  exports.load.inject('process', 'test');
});

// set up the testing secrets
exports.secrets = new Secrets({
  secretName: 'project/taskcluster/testing/taskcluster-github',
  secrets: {
    taskcluster: [
      {env: 'TASKCLUSTER_ROOT_URL', cfg: 'taskcluster.rootUrl', name: 'rootUrl'},
      {env: 'TASKCLUSTER_CLIENT_ID', cfg: 'taskcluster.credentials.clientId', name: 'clientId'},
      {env: 'TASKCLUSTER_ACCESS_TOKEN', cfg: 'taskcluster.credentials.accessToken', name: 'accessToken'},
    ],
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
  
  return new Promise (function(accept, reject) {
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
 * Set up a fake publisher.  Call this before withServer to ensure the server
 * uses the same publisher.
 */
exports.withFakePublisher = (mock, skipping) => {
  suiteSetup(async function() {
    if (skipping()) {
      return;
    }
    exports.load.save();

    exports.load.cfg('pulse.fake', true);
    exports.load.cfg('taskcluster.rootUrl', libUrls.testRootUrl());
    await exports.load('publisher');
  });

  suiteTeardown(function() {
    if (skipping()) {
      return;
    }
    exports.load.restore();
  });
};

/**
 * Set helper.Builds and helper.OwnersDirectory to fully-configured entity
 * objects, and inject them into the loader. These tables are cleared at
 * suiteSetup, but not between test cases.
 */
exports.withEntities = (mock, skipping) => {
  suiteSetup(async function() {
    if (skipping()) {
      return;
    }

    // Need to generate these each time so that pushes and PRs can run at the same time
    // Maybe at some point we should cook up a real solution to this.
    const tableVersion = slugid.nice().replace(/[_-]/g, '');
    exports.buildsTableName = `TaskclusterGithubBuildsV${tableVersion}`;
    exports.ownersTableName = `TaskclusterIntegrationOwnersV${tableVersion}`;
    exports.load.cfg('app.buildsTableName', exports.buildsTableName);
    exports.load.cfg('app.ownersDirectoryTableName', exports.ownersTableName);

    if (mock) {
      const cfg = await exports.load('cfg');
      exports.load.inject('Builds', data.Builds.setup({
        tableName: 'Builds',
        credentials: 'inMemory',
      }));
      exports.load.inject('OwnersDirectory', data.OwnersDirectory.setup({
        tableName: 'OwnersDirectory',
        credentials: 'inMemory',
      }));
    }

    exports.Builds = await exports.load('Builds');
    await exports.Builds.ensureTable();

    exports.OwnersDirectory = await exports.load('OwnersDirectory');
    await exports.OwnersDirectory.ensureTable();
  });

  const cleanup = async () => {
    if (!skipping()) {
      await exports.Builds.scan({}, {handler: secret => secret.remove()});
      await exports.OwnersDirectory.scan({}, {handler: secret => secret.remove()});
    }
  };
  suiteSetup(cleanup);
  suiteTeardown(cleanup);
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
    const cfg = await exports.load('cfg');

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
