import http from 'http';
import fs from 'fs';
import _ from 'lodash';
import sinon from 'sinon';
import builder from '../src/api.js';
import taskcluster from 'taskcluster-client';
import mainLoad from '../src/main.js';
import fakeGithubAuth from './github-auth.js';

import testing from 'taskcluster-lib-testing';

export const load = testing.stickyLoader(mainLoad);

suiteSetup(async function() {
  load.inject('profile', 'test');
  load.inject('process', 'test');
});

testing.withMonitor({ load });

// set up the testing secrets
export const secrets = new testing.Secrets({
  secrets: {
  },
  load: load,
});

// Build an http request from a json file with fields describing
// headers and a body
export const jsonHttpRequest = function(jsonFile, options) {
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

export const withDb = (mock, skipping) => {
  const helper = { load };
  testing.withDb(mock, skipping, helper, 'github');
  return helper;
};

export const withPulse = (mock, skipping) => {
  const helper = { load };
  testing.withPulse({ helper, skipping, namespace: 'taskcluster-github' });
  return helper;
};

/**
 * Set the `github` loader component to a fake version.
 * This is reset before each test.  Call this before withServer.
 */
export const withFakeGithub = (mock, skipping) => {
  suiteSetup(function() {
    load.inject('github', fakeGithubAuth());
  });

  suiteTeardown(function() {
    load.remove('github');
  });

  setup(async function() {
    let fakeGithub = await load('github');
    fakeGithub.resetStubs();
  });
};

/**
 * Set the `queueClient` loader component to a fake version.
 */
export const withFakeQueue = (mock, skipping) => {
  const fakeQueueClient = () => new taskcluster.Queue({
    rootUrl: 'https://tc.example.com',
    fake: {
      sealTaskGroup: sinon.stub(),
      cancelTaskGroup: sinon.stub(),
    },
  });

  suiteSetup(function() {
    load.inject('queueClient', fakeQueueClient());
  });

  suiteTeardown(function() {
    load.remove('queueClient');
  });
};

// even if we are using a "real" rootUrl for access to Azure, we use
// a local rootUrl to test the API, including mocking auth on that
// rootUrl.
export const exportHelper = {
  rootUrl: 'http://localhost:60415',
  GithubClient: null,
  apiClient: null,

  withDb,
  withPulse,
  secrets,
  load,
  jsonHttpRequest,
  withFakeGithub,
  withFakeQueue,
};
export default exportHelper;

/**
 * Set up an API server.  Call this after withDb, so the server
 * uses the same entities classes.
 *
 * This also sets up helper.apiClient as a client of the service API.
 */
export const withServer = (mock, skipping) => {
  let webServer;

  suiteSetup(async function() {
    if (skipping()) {
      return;
    }
    await load('cfg');

    load.cfg('taskcluster.rootUrl', exportHelper.rootUrl);
    load.cfg('taskcluster.clientId', null);
    load.cfg('taskcluster.accessToken', null);

    testing.fakeauth.start({
      'test-client': ['*'],
    }, { rootUrl: exportHelper.rootUrl });

    exportHelper.GithubClient = taskcluster.createClient(builder.reference());

    exportHelper.apiClient = new exportHelper.GithubClient({
      credentials: { clientId: 'test-client', accessToken: 'unused' },
      rootUrl: exportHelper.rootUrl,
      retries: 0,
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
exportHelper.withServer = withServer;

export const resetTables = (mock, skipping) => {
  setup('reset tables', async function() {
    await testing.resetTables({ tableNames: [
      'github_builds',
      'github_checks',
      'github_integrations',
    ] });
  });
};
exportHelper.resetTables = resetTables;
